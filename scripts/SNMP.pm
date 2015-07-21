package SNMP;

our $OIDs = { ifDescr => '1.3.6.1.2.1.2.2.1.2',
	  ifEntry => '1.3.6.1.2.1.2.2.1',
	  ifAlias => '1.3.6.1.2.1.31.1.1.1.18',
	  ifAdminStatus => '1.3.6.1.2.1.2.2.1.7',
	  ifIndex => '1.3.6.1.2.1.2.2.1.1',
	  ifType => '1.3.6.1.2.1.2.2.1.3',
	  ifOutErrors => '1.3.6.1.2.1.2.2.1.20',
	  ifLastChange => '1.3.6.1.2.1.2.2.1.9',
	  ifMtu => '1.3.6.1.2.1.2.2.1.4',
	  ifSpeed => '1.3.6.1.2.1.2.2.1.5',
	  ifHighSpeed => '1.3.6.1.2.1.31.1.1.1.15',
	  ifPhysAddress => '1.3.6.1.2.1.2.2.1.6',
	  ifOperStatus => '1.3.6.1.2.1.2.2.1.8',
	  ifInOctets => '1.3.6.1.2.1.2.2.1.10',
	  ifHCInOctets => '1.3.6.1.2.1.31.1.1.1.6',
	  ifInUcastPkts => '1.3.6.1.2.1.2.2.1.11',
	  ifInDiscards => '1.3.6.1.2.1.2.2.1.13',
	  ifInErrors => '1.3.6.1.2.1.2.2.1.14',
	  ifOutOctets => '1.3.6.1.2.1.2.2.1.16',
	  ifHCOutOctets => '1.3.6.1.2.1.31.1.1.1.10',
	  ifSysname => '1.3.6.1.2.1.1.5',
};

our $reverseOIDs = { reverse(%$OIDs) };
return 1;
