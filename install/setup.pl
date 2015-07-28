#!/usr/bin/perl
print "\n\nUpdating Ubuntu ... ";
system("apt-get -y update >/dev/null && sudo apt-get -y upgrade >/dev/null && sudo aptitude -y safe-upgrade >/dev/null");
print " Done\n";

print "\nInstalling required packages ... ";
system("apt-get install -y git libcommon-sense-perl libdbix-simple-perl libnet-snmp-perl npm mysql-client >/dev/null");
print " Done\n";

print "\nInstalling MySQL -- leave root passwords blank when prompted\n";
print "Press a key to continue\n";
system("bash -c 'read -n 1 -s'");
system("apt-get install -y mysql-server");

print "\nInstalling Weathermap ... ";
system("git clone https://github.com/proguen/weathermap.git /opt/weathermap");
system("mysqladmin -u root create snmp");
system("mysql -u root snmp < /opt/weathermap/install/sql.ddl");
system("cd /opt/weathermap && sudo npm install");
system("cp /opt/weathermap/install/weathermap-app.conf /opt/weathermap/install/weathermap-poller.conf /opt/weathermap/install/weathermap-updater.conf /etc/init");
print " Done\n";

print "\n\n ** Edit /opt/weathermap/conf/config.js, then restart **\n\n";
