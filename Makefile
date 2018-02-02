deps:
	npm install --ignore-scripts --production
	cpan App::cpanminus
	cpanm -n inc::Module::Install
	cpanm -n Module::Build::Tiny
	cpanm -n ExtUtils::MakeMaker
	cpanm -n Module::Install::CPANfile
	cpanm -n CPAN::Meta::Spec
	cpanm -n Module::Build ::Pluggable::CPANfile
	cpanm -n Dist::Zilla
	cpanm -n Dist::Zilla::Plugin::Git
	cpanm -n Dist::Zilla::Plugin::Prereqs::FromCPANfile
	cpanm -n Dist::Milla
	cpanm -n Minilla
	cpanm -n Module::Build
