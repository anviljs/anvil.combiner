var path = require( "path" );

module.exports = function( _, anvil ) {

	var filterNulls = function( list ) {
		return _.filter( list, function( x ) { return x; } );
	};

	return anvil.plugin( {
		name: "anvil.combiner",
		activities: [ "combine", "compile" ],
		dependencies: [ "anvil.concat", "anvil.transform" ],
		config: {
			patterns: [
				{
					extensions: [ ".html" ],
					find: "/[<][!][-]{2}.?import[(]?.?[\"'].*[\"'].?[)]?.?[-]{2}[>]/g",
					replace: "/([ \t]*)[<][!][-]{2}.?import[(]?.?[\"']replace[\"'].?[)]?.?[-]{2}[>]/g"
				},
				{
					extensions: [ ".js" ],
					find: "/([\/]{2}|[\/][*]).?import.?[(]?.?[\"'].*[\"'].?[)]?[;]?.*?(\n[*][\/])?/g",
					replace: "/([ \t]*)([\/]{2}|[\/][*]).?import.?[(]?.?[\"']replace[\"'].?[)]?[;]?.*?(\n[*][\/])?/g"
				},
				{
					extensions: [ ".css" ],
					find: "/([\/]{2}|[\/][*]).?import[(]?.?[\"'].*[\"'].?[)]?([*][\/])?/g",
					replace: "/([ \t]*)([\/]{2}|[\/][*]).?import[(]?.?[\"']replace[\"'].?[)]?([*][\/])?/g"
				},
				{
					extensions: [ ".yaml", ".yml", ".json" ],
					alternateExtensions: [ ".*" ],
					find: "/([ \t]*)[-][ ]?import[:][ ]*[\"'].*[\"']/g",
					replace: "/([ \t]*)[-][ ]?import[:][ ]*[\"']replace[\"']/g"
				}
			]
		},

		run: function( done ) {
			var self = this,
				list = anvil.project.files,
				combinerFactory = function( file ) {
					return function( done ) {
						self.combine( file, done );
					};
				},
				findImports = _.bind( function( file, done ) {
					self.findImports( file, list, done );
				}, this ),
				match = function( file, dependency ) {
					return dependency.fullPath === file.fullPath;
				};

			anvil.scheduler.parallel( list, findImports, function() {
				_.each( list, function( file ) {
					self.findDependents( file, list );
				} );
				var sorted = anvil.utility.dependencySort( list, "descending", match ),
					combiners = _.map( sorted, combinerFactory );
				anvil.scheduler.pipeline( undefined, combiners, done );
			} );
		},

		combine: function( file, done ) {
			var self = this;
			try {
				if( file.imports.length > 0 ) {
					var steps = _.map( file.imports, function( imported ) {
						return self.getStep( file, imported );
					} );
					var fileSpec = [ file.workingPath, file.name ];
					anvil.fs.read( fileSpec, function( main ) {
						anvil.scheduler.pipeline( main, steps, function( result ) {
							if( result ) {
								anvil.fs.write( fileSpec, result, function() { done(); } );
							} else {
								done();
							}
						} );
					} );
				} else {
					done();
				}
			} catch ( err ) {
				anvil.log.error( "Error combining imports for '" + file.fullPath + "/" + file.name + "'" );
			}
		},

		findDependents: function( file, list ) {
			var imported = function( importFile ) {
				return file.fullPath === importFile.fullPath;
			};
			_.each( list, function( item ) {
				if( _.any( item.imports, imported ) ) {
					file.dependents.push( item );
					file.noCopy = true;
				}
			} );
		},

		findImports: function( file, list, done ) {
			var self = this,
				patterns = this.getPatterns( file );
			if( file.state != "done" )
			{
				anvil.fs.read( [ file.workingPath, file.name ], function( content ) {
					var imports = self.getImports( content, patterns );
					_.each( imports, function( imported ) {
						var importName = self.getImportName( imported ),
							importNameOnly = importName.replace( path.extname( importName ), "" ),
							importedFile = _.find( list,
								function( i ) {
									return self.importMatch( file, i, importName, importNameOnly, patterns );
								} );
						if( importedFile ) {
							file.imports.push( importedFile );
						}
					} );
					done();
				} );
			} else {
				done();
			}
		},

		getImports: function( content, patterns ) {
			var imports = [];
			_.each( patterns, function( pattern ) {
				imports = imports.concat( content.match( pattern.finder ) );
			} );
			return filterNulls( imports );
		},

		getImportName: function( imported ) {
			var importName = imported.match( /["'].*[\"']/ )[ 0 ].replace( /["']/g, "" );
			importName = importName.match( /^[.]{1,2}[\/]/ ) ?
							importName : "./" + importName;
			return importName;
		},

		getPattern: function( extension ) {
			return _.find( anvil.config[ this.name ].patterns, function( pattern ) {
				return _.any( pattern.extensions, function( ext ) { return extension == ext; } );
			} ) || {};
		},

		getPatterns: function( file ) {
			return [
				this.getPatternFinderForExtension( path.extname( file.originalPath ) ),
				this.getPatternFinderForExtension( file.extension() )
			];
		},

		getPatternFinderForExtension: function( extension ) {
			var pattern = this.getPattern( extension ),
				finder = pattern.find ? anvil.utility.parseRegex( pattern.find ) : undefined;
			return { pattern: pattern, finder: finder };
		},

		getRelativePath: function( host, imported, omitPrefix, asRegex ) {
			var relativeImportPath = path.relative(
										path.dirname( host.fullPath ),
										path.dirname( imported.fullPath ) ),
				relativeImport = anvil.fs.buildPath( [ relativeImportPath, imported.name ] ),
				currentExt = imported.extension(),
				originalExt = path.extname( imported.originalPath );
				if( !omitPrefix ) {
					relativeImport = relativeImport.match( /^[.]{1,2}[\/]/ ) ?
					relativeImport : "./" + relativeImport;
				}
			return asRegex ?
					relativeImport.replace( path.extname( relativeImport ), "(" + currentExt + "|" + originalExt + ")?" ) :
					relativeImport;
		},

		getStep: function( file, imported ) {
			var self = this;
			return function( text, done ) {
				if( file.state != "done" || imported != "done" ) {
					anvil.log.debug( "combining '" + imported.name + "' into '" + file.name + "'");
					self.replaceImport( text, file, imported, done );
				} else {
					done();
				}
			};
		},

		hasMatchingExtension: function( patterns, file ) {
			var originalExt = path.extname( file.originalPath ),
				currentExt = file.extension(),
				getMember = function( member ) {
					return function( pattern ) { return pattern.pattern[ member ]; };
				},
				map = function( member ) {
					return _.map( patterns, getMember( member ) );
				},
				match = function( x ) {
					return x === originalExt || x === currentExt || x === ".*";
				},
				flatten = function( lists ) { return filterNulls( _.flatten( lists ) ); },
				extensions = flatten( map( "extensions" ) ),
				alternates = flatten( map( "alternateExtensions" ) );
			return _.any( extensions, match ) || _.any( alternates, match );
		},

		importMatch: function( host, file, name, nameOnly, patterns ) {
			var relativeImport = this.getRelativePath( host, file ),
				nameMatch = relativeImport === name || relativeImport.indexOf( nameOnly ) === 0,
				extensionMatch = this.hasMatchingExtension( patterns, file );
			return nameMatch && extensionMatch;
		},

		replace: function( pattern, importAlias, content, newContent ) {
			var stringified = pattern.replace( /replace/, "([.][/])?" + importAlias ),
				fullPattern = anvil.utility.parseRegex( stringified ),
				capture = fullPattern.exec( content ),
				sanitized = newContent.replace( "$", "dollarh" ),
				whiteSpace;

			if( capture && capture.length > 1 ) {
				whiteSpace = capture[1];
				sanitized = whiteSpace + sanitized.replace( /\n/g, ( "\n" + whiteSpace ) );
			}
			return content.replace( fullPattern, sanitized ).replace( "dollarh", "$" );
		},

		replaceImport: function( content, file, imported, done ) {
			var self = this,
				ext = file.extension(),
				pattern = this.getPattern( ext ).replace,
				source = imported.name,
				working = imported.workingPath,
				importAlias = this.getRelativePath( file, imported, true, true );
			try {
				anvil.fs.read( [ working, source ], function( newContent ) {
					done( self.replace( pattern, importAlias, content, newContent ) );
				} );
			} catch ( err ) {
				anvil.log.error( "Error replacing import statements for '" + file.fullPath + "/" + file.name + "'" );
				done();
			}
		}
	} );
};