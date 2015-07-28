echo -e "Updating Ubuntu ..."
apt-get -y update && sudo apt-get -y upgrade && sudo aptitude -y safe-upgrade >/dev/null 2>&1
echo "Done"

echo -e "\nInstalling required packages ..."
apt-get install -y git libcommon-sense-perl libdbix-simple-perl libnet-snmp-perl npm >/dev/null 2>&1
echo "Done"

echo -e "\nInstalling MySQL -- leave root passwords blank when prompted"
sleep 5
apt-get install -y mysql-server

echo -e "\n\nInstall Weathermap"
git clone https://github.com/proguen/weathermap.git /opt/weathermap
mysqladmin -u root create snmp
mysql -u root snmp < /opt/weathermap/conf/sql.ddl
cd /opt/weathermap && sudo npm install
cp /opt/weathermap/install/weathermap-app.conf /opt/weathermap/install/weathermap-poller.conf /opt/weathermap/install/weathermap-updater.conf /etc/init

echo -e "\n\nEdit /opt/weathermap/conf/config.js, then restart\n"
