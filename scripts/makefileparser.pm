#! /usr/bin/perl
use Time::Out qw(timeout);

# user passes in file location
my $make_or_build_file_location = shift(@ARGV);

my $timeout_seconds = 60; # 1 minute timeout

# This creates a MYMETA.(yml/json) file
timeout $timeout_seconds => sub {
  my $package = require $make_or_build_file_location;
};