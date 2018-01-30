# srclib-dotnet

You need node.js and NPM installed

##Assumptions Made

* All files under directories with the name “test” or “tests” will be ignored
* If the XML files being read are not utf-8 encoding, we assume they are UTF-16LE, and will attempt to convert
* If a .csproj/.xproj file is found, and there is no packages.config/project.json file in the same directory, then this will be read in as a src unit
* If a .nuspec file is found, and there is no .csproj/.xproj file in the same directory, then we scan this and create a src unit
* Any packages.config/project.json file found will be added as a src unit


##TODO

Add scanning for NuGet.config file to see the package sources we need to explore