CREATE TABLE `circuit` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(30) DEFAULT NULL,
  `poll_frequency` int(10) unsigned DEFAULT NULL,
  `next_poll` int(10) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `name` (`name`),
  KEY `next_poll` (`next_poll`)
) DEFAULT CHARSET=latin1;

CREATE TABLE `circuit_end` (
  `circuit_id` int(10) unsigned DEFAULT NULL,
  `end` varchar(1) DEFAULT NULL,
  `interface_id` int(10) unsigned DEFAULT NULL,
  `direction` varchar(1) DEFAULT NULL,
  KEY `circuit_id` (`circuit_id`),
  KEY `interface_id` (`interface_id`)
) DEFAULT CHARSET=latin1;

CREATE TABLE `device` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `name` varchar(50) DEFAULT NULL,
  `ip` varchar(15) DEFAULT NULL,
  `last_config_refresh` datetime DEFAULT NULL,
  `community` varchar(50) DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `ip` (`ip`),
  KEY `last_config_refresh` (`last_config_refresh`)
) DEFAULT CHARSET=latin1;

CREATE TABLE `interface` (
  `id` int(10) unsigned NOT NULL AUTO_INCREMENT,
  `device_id` int(10) unsigned DEFAULT NULL,
  `name` varchar(50) DEFAULT NULL,
  `snmp_index` int(10) unsigned DEFAULT NULL,
  `64bit` tinyint(3) unsigned DEFAULT NULL,
  `speed` bigint(20) unsigned DEFAULT NULL,
  `description` varchar(255) DEFAULT NULL,
  `status` tinyint(3) unsigned DEFAULT NULL,
  PRIMARY KEY (`id`)
) ENGINE=MyISAM  DEFAULT CHARSET=latin1;

CREATE TABLE `interface_raw_poll` (
  `interface_id` int(10) unsigned DEFAULT NULL,
  `timestamp` int(10) unsigned DEFAULT NULL,
  `in_bytes` bigint(20) unsigned DEFAULT NULL,
  `out_bytes` bigint(20) unsigned DEFAULT NULL,
  KEY `interface_id` (`interface_id`),
  KEY `timestamp` (`timestamp`)
) ENGINE=MyISAM DEFAULT CHARSET=latin1;
