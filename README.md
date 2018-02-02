# srclib-perl

You need node.js and NPM installed. Read https://www.notion.so/fossa/Perl-Language-Integration-c2d2548fde6447d9b51893fb7aa39796 for an overview

##Assumptions Made

Several perl modules need to be installed. 

- install perl, which comes with cpan
- `cpan App::cpanminus`
- `cpanm inc::Module::Install`
- `cpanm Module::Build::Tiny`
- `cpanm ExtUtils::MakeMaker`
- `cpanm Module::Install::CPANfile`
- `cpanm Dist::Milla`
- `cpanm CPAN::Meta::Spec`
- `cpanm Dist::Milla`
- `cpanm Module::Build::Pluggable::CPANfile`
- `cpanm Minilla`
- `cpanm Dist::Zilla::Plugin::Prereqs::FromCPANfile`

##TODO

- private repositories
- integrate with Carton