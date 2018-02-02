deps:

	npm install --ignore-scripts --production
	cpan App::cpanminus
	cpanm inc::Module::Install
	cpanm Module::Build::Tiny
	cpanm ExtUtils::MakeMaker
	cpanm Module::Install::CPANfile
	cpanm CPAN::Meta::Spec
	cpanm Dist::Milla
	cpanm Module::Build::Pluggable::CPANfile
	cpanm Minilla
	cpanm Dist::Zilla::Plugin::Prereqs::FromCPANfile
	cpanm Module::Build
