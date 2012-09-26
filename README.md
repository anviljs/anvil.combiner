## Anvil Combiner Plugin

This plugin is a core component of anvil and is required to function as expected.

## Installation

anvil will install this plugin during post-install.

# Usage

The combiner replaces import statements in files based on configurable regular expressions that allow the plugin to identify and replace the statements with targeted file contents. The combiner now runs before and after compile/transform so that cross-extension imports are now supported.

## Imports

Import statements are extension specific. The combiner supports import statements for .js, .html, .css and .json/.yaml or .yml files (which are really just there for internal purposes).

Aside from an import statement's syntax, they all contain a reference to another file in your project's structure. The path to the imported file should be relative to the file you're making the import statement from.

The file name can take the following format:

  * Include the original extension of the target file
  * Exclude the extension altogether
  * Include the eventual extension of the target file (for files that will be compiled/transpiled)

The intention here is to make it simple to import files without having to worry about what a file might be called eventually.

## Cross-Type Imports
	note: This is a new feature to the combiner plugin and may have bugs.

Several requests to support this behavior have been around since anvil started but due to how the pipeline had been developed, there was no good way to add support for this feature.

Now that plugins can opt-in to multiple activities, the combiner has to be choosier about what it tries to import and will take a second pass after the transform/compile step has happened. Anvil will not import a file unless the answer to one of these questions is yes:

	* Does the target file have the same current extension as the host file?
	* Does the target file have an alternate extension listed in the patterns?

## Adding Support for New File Types
The combiner plugin has a very specfic object format for defining how it finds and replaces import statements based on the file type (determined by the extension). Here's what the default block would look like in a build file:

	"anvil.combiner": {
		"patterns": [
			{
				"extensions": [
					".html"
				],
				"find": "/[<][!][-]{2}.?import[(]?.?[\"'].*[\"'].?[)]?.?[-]{2}[>]/g",
				"replace": "/([ \t]*)[<][!][-]{2}.?import[(]?.?[\"']replace[\"'].?[)]?.?[-]{2}[>]/g"
			},
			{
				"extensions": [
					".js"
				],
				"find": "/([/]{2}|[/][*]).?import.?[(]?.?[\"'].*[\"'].?[)]?[;]?.*?(\n[*][/])?/g",
				"replace": "/([ \t]*)([/]{2}|[/][*]).?import.?[(]?.?[\"']replace[\"'].?[)]?[;]?.*?(\n[*][/])?/g"
			},
			{
				"extensions": [
					".css"
				],
				"find": "/([/]{2}|[/][*]).?import[(]?.?[\"'].*[\"'].?[)]?([*][/])?/g",
				"replace": "/([ \t]*)([/]{2}|[/][*]).?import[(]?.?[\"']replace[\"'].?[)]?([*][/])?/g"
			},
			{
				"extensions": [
					".yaml",
					".yml",
					".json"
				],
				"alternateExtensions": [
					".*"
				],
				"find": "/([ \t]*)[-][ ]?import[:][ ]*[\"'].*[\"']/g",
				"replace": "/([ \t]*)[-][ ]?import[:][ ]*[\"']replace[\"']/g"
			},
		]
	}

To add to this configuration, you would redefine the the anvil.combiner object with a patterns list of new patterns you wished to add. You cannot remove existing patterns from the combiner via configuration; this section is additive. Note that the only difference between the find and replace pattern is the placement of the replace word so that anvil can create a targeted regex for replacing specific import statements with the file contents.

## Treating Different Extensions As An Equivalent Type

If you wanted to add support for a new file extension and have the combiner grab other extensions before compilation, you can add an "alternateExtensions" attribute to your file type definition. This property is an array of extensions that the combiner should consider equivalent and import before compile/transform.

Adding a ".*" to alternate extensions indicates that files of any type should be eagerly imported. Use with caution.

## Warning: File Name Collisions
You should never have two files in the same folder where the only difference between them is the extension. I know, naming things is hard, but if you really think about it having a person.html, person.js, person.css and person.coffee in the same folder only encourages your teammates to slap you. In addition; anvil will probably freak out and do unexpected things. Put another way, if you love surprises, name everything in your project the same name.