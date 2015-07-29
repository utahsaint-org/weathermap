#!/usr/bin/perl
$| = 1;

run_command("sudo true"); # Prompt for sudo password right away

print "\n\nSetting up Weathermap\n";
print "\nUpdating Ubuntu\n  apt-get update ";
run_command("sudo apt-get -y update", 1);
print " Done\n  apt-get upgrade ";
run_command("sudo apt-get -y upgrade", 1);
print " Done\n  aptitude safe-upgrade ";
run_command("sudo aptitude -y safe-upgrade", 1);
print " Done\n";

print "\nInstalling required packages\n";
for (qw/git libcommon-sense-perl libdbix-simple-perl libnet-snmp-perl npm mysql-client/) {
    print "  $_ \n";
    run_command("sudo apt-get install -y $_ >/dev/null");
}
print " Done\n";

print "\nInstalling MySQL server -- \n ** leave MySQL root password blank - just press Enter or Return when prompted for a MySQL root password **\n";
print "Press any key to continue\n";
keypress();
run_command("sudo apt-get install -y mysql-server");
print "\n\n  Done installing MySQL server\n";

print "\nInstalling Weathermap\n";
if (-e "/opt/weathermap" && -e "/opt/weathermap/.git") {
    print "  Updating GitHub repo .. ";
    run_command("cd /opt/weathermap; sudo git pull >/dev/null");
} else {
    print "  Cloning GitHub repo .. ";
    run_command("sudo git clone https://github.com/proguen/weathermap.git /opt/weathermap >/dev/null");
}
print "Done\n";
if(system("echo 'select 1' | mysql -u root snmp >/dev/null 2>&1")) {
    print "  Setting up MySQL database .. ";
    run_command("sudo mysqladmin -u root create snmp >/dev/null");
    run_command("sudo mysql -u root snmp < /opt/weathermap/install/sql.ddl >/dev/null");
    print "Done\n";
}
print "  Finalizing setup .. ";
run_command("cd /opt/weathermap && sudo npm install >/dev/null 2>&1");
run_command("sudo cp /opt/weathermap/install/weathermap-app.conf /opt/weathermap/install/weathermap-poller.conf /opt/weathermap/install/weathermap-updater.conf /etc/init >/dev/null");
run_command("sudo cp /opt/weathermap/conf/config.js.README /opt/weathermap/conf/config.js >/dev/null");
run_command("sudo cp /opt/weathermap/public/maps/config.json.TEMPLATE /opt/weathermap/public/maps/config.json >/dev/null");
print "Done\n";

print "\n\n ** Edit /opt/weathermap/conf/config.js, then restart **\n\n";

sub run_command {
    my ($command, $show_progress) = @_;
    if ($show_progress) {
	open my $cmd, "$command |";
	while(<$cmd>) {
	    print ".";
	}
	close $output;
    } else {
	if (system($command)) {
	    print "\n Setup process failed\n";
	    exit;
	}
    }
}

sub keypress {
    require Term::ReadKey;
    my $key;
    Term::ReadKey::ReadMode(4); # Turn off controls keys
    while (!defined ($key = Term::ReadKey::ReadKey(-1))) { }
    Term::ReadKey::ReadMode(0); # Reset tty mode before exiting
    die "Break pressed" if ord($key) == 3;
}
