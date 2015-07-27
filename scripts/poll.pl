#!/usr/bin/perl

use common::sense;
use Database;
use Net::SNMP qw(:snmp);
use SNMP;
use Carp;
use Time::HiRes qw/gettimeofday tv_interval/;

my $log_file = "/var/log/weathermap_poller.log";
my $db = Database->db;

# Track devices being polled to prevent dups
my %polling;
my $poll_wait = 5; # Wait 5 seconds before re-trying
my $default_community;

while (1) {
  eval { chomp($default_community = `nodejs -e 'console.log(require("/opt/weathermap/conf/config.js").defaultCommunity)' 2>/dev/null`); };

  my $start = [gettimeofday];
  poll_ints();

  # Pause at least 1 second
  my $elapsed = tv_interval($start);
  if ($elapsed < 1) {
    sleep($elapsed - 1);
  }

  expire_polls();
}

# Expire old polls
sub expire_polls {
    my $time = time() - $poll_wait;
    delete $polling{$_} for grep { $polling{$_} < $time } keys %polling;
}

# Poll interfaces
sub poll_ints {
  my %devices;

  # The sub-query is necessary because DBIx::Simple does not support GROUP BY
  for my $int (@{$db->select('(SELECT interface_id, ip, community, snmp_index, 64bit, circuit_id, circuit.name as circuit_name, next_poll FROM device INNER JOIN interface ON device.id = interface.device_id INNER JOIN circuit_end ON interface.id = circuit_end.interface_id INNER JOIN circuit ON circuit.id = circuit_end.circuit_id GROUP BY interface_id) a',
			     'interface_id, ip, community, snmp_index, 64bit, circuit_id, circuit_name',
			     { next_poll => [ -or => undef, {'<=', time() }] })->hashes}) {
    my $ip = $int->{ip};
    $devices{$ip} = { ip => $ip, community => $int->{community} || $default_community, ints => {} }
      unless $devices{$ip};
    $devices{$ip}->{ints}->{$int->{snmp_index}} = { map { ( $_ => $int->{$_} ) } qw/interface_id snmp_index 64bit circuit_id/ };
  }

  for my $ip (keys %devices) {
    my $device = $devices{$ip};

    my ($session, $error) = Net::SNMP->session(
					       -hostname    => $device->{ip},
					       -community   => $device->{community},
					       -nonblocking => 1,
					       -version     => 'snmpv2c',
					      );

    if (!defined $session) {
      carp sprintf "ERROR: %s.\n", $error;
      return;
    }

    my @oids;
    for my $int (values %{$device->{ints}}) {
      # Skip any we're still polling
      next if $polling{"$ip:$int->{snmp_index}"};

      my $oid = "if" . ($int->{'64bit'} ? "HC" : "");
      push @oids, $SNMP::OIDs->{$oid . 'InOctets'} . ".$int->{snmp_index}",
	$SNMP::OIDs->{$oid . 'OutOctets'} . ".$int->{snmp_index}";

      # Lock this one until we're done
      $polling{"$ip:$int->{snmp_index}"} = time();

      if (@oids >= 20) { # Poll 20 oids at a time
	request(-session => $session,
		-oids => \@oids,
		-devices => \%devices);
	@oids = ();
      }
    }
    request(-session => $session,
	    -oids => \@oids,
	    -devices => \%devices) if @oids;
  }

  # Now initiate the SNMP message exchange.
  snmp_dispatcher();
}

# Initiate SNMP request
sub request {
  my %args = (-session => undef,
	      -oids => undef,
	      -devices => undef,
	      @_);

  my %devices = %{$args{-devices}};
  my $result = $args{-session}->get_request(
					    -varbindlist      => $args{-oids},
					    -callback       => sub {
					      my %values;
					      my @poll_deletes;
					      my $time = time();
					      my $session = shift;
					      my $inserts = {};
					      while (my ($k, $v) = each(%{$session->var_bind_list()})) {
						$DB::single=1;
						my ($base, $index) = $k =~ /^(.*)\.(\d+)/;
						my $oid_name = $SNMP::reverseOIDs->{$base};
						my $direction = $oid_name =~ /OutOctets/ ? "O" : "I";
						my $int = $devices{$session->hostname}->{ints}->{$index};
						$values{$int->{interface_id}}->{$direction} = $v;
						push @poll_deletes, join(":", $devices{$session->hostname}->{ip}, $index);
						$db->update('circuit', { next_poll => \"poll_frequency + $time" }, { id => $int->{circuit_id} });
					      }

					      my @inserts;
					      for my $id (keys %values) {
						push @inserts, [$id, $time, $values{$id}->{I}, $values{$id}->{O}];
					      }
					      while (@inserts) {
						my @chunk = splice(@inserts, 0, 50); # Insert 50 rows at a time

						$db->dbh->do("INSERT INTO interface_raw_poll VALUES " . join(",", map { "(" . join(",", @$_) . ")" } @chunk));
					      }

					      # Done with these polls
					      delete $polling{$_} for @poll_deletes;
					    });

  if (!defined $result) {
    carp printf "ERROR: %s\n", $args{-session}->error();
    $args{-session}->close();
    exit 1;
  }
}

sub log {
  my $message = shift;

  open LOG, ">> $log_file";
  print LOG;
  close LOG;
}
