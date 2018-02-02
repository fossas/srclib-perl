deps:

	npm install --ignore-scripts --production
	apt-get update
	apt-get install build-essential
	apt-get install perl
	cpan App::cpanminus
	cpanm inc::Module::Install
	cpanm Module::Build::Tiny
	cpanm ExtUtils::MakeMaker
	cpanm Module::Install::CPANfile
	cpanm Dist::Milla
	cpanm CPAN::Meta::Spec
	cpanm Dist::Milla
	cpanm Module::Build::Pluggable::CPANfile
	cpanm Minilla
	cpanm Dist::Zilla::Plugin::Prereqs::FromCPANfile
	cpanm Module::Build
