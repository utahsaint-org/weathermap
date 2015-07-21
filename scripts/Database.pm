package Database;

use common::sense;
use DBIx::Simple;

our $connection;

sub db {
    return $connection || ($connection = DBIx::Simple->new("DBI:mysql:database=snmp", "", ""));
}

sub device {
    shift if $_[0] eq __PACKAGE__;
    my $where = shift;

    return db()->select('device', '*', $where)->hash;
}

sub devices {
    shift if $_[0] eq __PACKAGE__;
    my $where = shift || undef;

    return db()->select('device', '*', $where)->hashes;
}

return 1;
