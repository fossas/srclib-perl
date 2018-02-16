#! /usr/bin/perl
use Module::CPANfile;
use JSON;

# user passes in file location
my $cpan_file_location = shift(@ARGV);

my $file = Module::CPANfile->load($cpan_file_location);
my $prereqs = $file->prereq_specs;

my $reqs = $prereqs->{'runtime'}->{'requires'};

my $json = encode_json $reqs;
print $json; # print to stdout