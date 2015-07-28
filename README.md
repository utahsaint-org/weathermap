# Weathermap installation

1. Install Ubuntu 14.04 64-bit - optionally install the OpenSSH package

2. After Ubuntu is installed, run the Weathermap setup script

    `$] wget -q -O - https://raw.githubusercontent.com/proguen/weathermap/master/install/setup.sh | sudo bash`

3. When the script completes, edit `/opt/weathermap/conf/config.js` to set the default SNMP community for your devices

4. Reboot the server

    `]$ sudo /sbin/reboot`

5. When the server finishes booting, connect to `http://<server IP>/admin` to configure devices and circuits
