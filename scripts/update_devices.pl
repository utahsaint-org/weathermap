#!/usr/bin/perl

use common::sense;
use Database;
use Net::SNMP qw(:snmp);

use FindBin;
use lib "$FindBin::Bin";

use SNMP;
use Carp;

my $db = Database->db;

while (1) {
    poll_int_config();
    sleep 15 * 60; # Poll device interfaces every 15 minutes
}

# Update device configuration
sub poll_int_config {
    my $default_community;
    eval { chomp($default_community = `nodejs -e 'console.log(require("/opt/weathermap/conf/config.js").defaultCommunity)' 2>/dev/null`); };

    my (%ints, %sysname);
    for my $device (@{Database->devices}) {
	# Update a single device
	next if $ARGV[0] && $ARGV[0] ne $device->{ip};

	my ($session, $error) = Net::SNMP->session(
	    -hostname    => $device->{ip},
	    -community   => $device->{community} || $default_community,
	    -nonblocking => 1,
	    -version     => 'snmpv2c',
	    );

	if (!defined $session) {
	    carp sprintf "ERROR: %s.\n", $error;
	    exit 1;
	}

	my $OIDs = { ifDescr => 'name',
		     ifSpeed => 'speed',
		     ifSpeed => 'speed',
		     ifHighSpeed => 'high_speed',
		     ifOperStatus => 'status',
		     ifAlias => 'description',
		     ifSysname => 'sysname',
	};

	for my $oid (keys %{$OIDs}) {
	    next if $device->{name} && $oid eq 'ifSysname'; # Skip if device has a name
	    my $OID = $SNMP::OIDs->{$oid};
	    my $result = $session->get_table(
		-baseoid => $OID,
		-callback       => sub {
		    my $session = shift;

		    while (my ($k, $v) = each(%{$session->var_bind_list()})) {
			if ($OIDs->{$oid} eq 'sysname') {
			  $sysname{$device->{ip}} = $v;
			} else {
			  my $index = oid_index($OID, $k);
			  $ints{$device->{ip}}->{$index}->{$OIDs->{$oid}} = $v;
			  $ints{$device->{ip}}->{$index}->{snmp_index} = $index
			    unless exists $ints{$device->{ip}}->{$index}->{snmp_index};
			}
		    }
		});

	    if (!defined $result) {
		carp printf "ERROR: %s\n", $session->error();
		$session->close();
		exit 1;
	    }
	}
    }

    # Now initiate the SNMP message exchange.
    snmp_dispatcher();

    # Process SNMP interface results
    for my $ip (keys %ints) {
	my ($device_id, $device_name) = $db->select('device', 'id,name', { ip => $ip })->flat;

	my $updates = { last_config_refresh => \'NOW()' };
	if ($sysname{$ip}) {
	  $updates->{name} = $sysname{$ip};
	}
	$db->update('device', $updates, { id => $device_id });

	my $db_ints = $db->select('interface', '*', { device_id => $device_id })->map_hashes('name');

	my @names = map { $_->{name} } values %{$ints{$ip}};
	for my $name (@names) {
	    my ($int) = grep { $_->{name} eq $name } values %{$ints{$ip}};

	    # Compute the interface speed and 64-bit support
	    my $high_speed = delete $int->{high_speed};
	    if ($int->{speed} == 2^32 - 1) {
		$int->{speed} = $high_speed * 1000000;
	    }
	    $int->{'64bit'} = $int->{speed} > 20000000 ? 1 : 0;

	    # Check whether an existing interface needs updating
	    if (my $row = $db_ints->{$name}) {
		my $updates = {};
		for (qw/name 64bit speed description snmp_index status/) {
		    if (exists $row->{$_} && ($row->{$_}+0 != $int->{$_}+0 || $row->{$_} ne $int->{$_})) {
			$updates->{$_} = $int->{$_};
		    }
		}
		if (%$updates) {
		    $db->update('interface', $updates, { id => $row->{id} });
		}
	    } else {
		# Insert a new interface
		delete $int->{id};
		$int->{device_id} = $device_id;
		$db->insert('interface', $int);
	    }
	}

	# Delete any interfaces not in SNMP results
	$db->delete('interface', { device_id => $device_id, name => { -not_in => \@names } });
    }
}

sub oid_index {
    my $base_oid = shift;
    my $oid = shift;

    return unless oid_base_match($base_oid, $oid);

    return substr($oid, length($base_oid) + 1);
}
