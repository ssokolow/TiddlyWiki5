/*\
title: $:/plugins/tiddlywiki/tw2parser/wikitextparser.js
type: application/javascript
module-type: parser

Parses a block of tiddlywiki-format wiki text into a parse tree object. This is a transliterated version of the old TiddlyWiki code. The plan is to replace it with a new, mostly backwards compatible parser built in PEGJS.

A wikitext parse tree is an array of objects with a `type` field that can be `text`,`macro` or the name of an HTML element.

Text nodes are represented as `{type: "text", value: "A string of text"}`.

Macro nodes look like this:
`
{type: "macro", name: "view", params: {
	one: {type: "eval", value: "2+2"},
	two: {type: "string", value: "twenty two"}
}}
`
HTML nodes look like this:
`
{type: "div", attributes: {
	src: "one"
	styles: {
		"background-color": "#fff",
		"color": "#000"
	}
}}
`

\*/
(function(){

/*jslint node: true, browser: true */
/*global $tw: false */
"use strict";

/*
Creates a new instance of the wiki text parser with the specified options. The
options are a hashmap of mandatory members as follows:

	wiki: The wiki object to use to parse any cascaded content (eg transclusion)

Planned:

	enableRules: An array of names of wiki text rules to enable. If not specified, all rules are available
	extraRules: An array of additional rule handlers to add
	enableMacros: An array of names of macros to enable. If not specified, all macros are available
	extraMacros: An array of additional macro handlers to add
*/

var WikiTextParser = function(options) {
	this.wiki = options.wiki;
	this.autoLinkWikiWords = true;
};

WikiTextParser.prototype.installRules = function() {
	var rules = require("./wikitextrules.js").rules,
		pattern = [];
	for(var n=0; n<rules.length; n++) {
		pattern.push("(" + rules[n].match + ")");
	}
	this.rules = rules;
	this.rulesRegExp = new RegExp(pattern.join("|"),"mg");
};

WikiTextParser.prototype.parse = function(type,text) {
	text = text || "";
	this.source = text;
	this.nextMatch = 0;
	this.children = [];
	this.dependencies = new $tw.Dependencies();
	this.output = null;
	this.subWikify(this.children);
	var tree = new $tw.Renderer(this.children,this.dependencies);
	this.source = null;
	this.children = null;
	return tree;
};

WikiTextParser.prototype.outputText = function(place,startPos,endPos) {
	if(startPos < endPos) {
		place.push($tw.Tree.Text(this.source.substring(startPos,endPos)));
	}
};

WikiTextParser.prototype.subWikify = function(output,terminator) {
	// Handle the terminated and unterminated cases separately, this speeds up wikifikation by about 30%
	if(terminator)
		this.subWikifyTerm(output,new RegExp("(" + terminator + ")","mg"));
	else
		this.subWikifyUnterm(output);
};

WikiTextParser.prototype.subWikifyUnterm = function(output) {
	// subWikify can be indirectly recursive, so we need to save the old output pointer
	var oldOutput = this.output;
	this.output = output;
	// Get the first match
	this.rulesRegExp.lastIndex = this.nextMatch;
	var ruleMatch = this.rulesRegExp.exec(this.source);
	while(ruleMatch) {
		// Output any text before the match
		if(ruleMatch.index > this.nextMatch)
			this.outputText(this.output,this.nextMatch,ruleMatch.index);
		// Set the match parameters for the handler
		this.matchStart = ruleMatch.index;
		this.matchLength = ruleMatch[0].length;
		this.matchText = ruleMatch[0];
		this.nextMatch = this.rulesRegExp.lastIndex;
		// Figure out which rule matched and call its handler
		var t;
		for(t=1; t<ruleMatch.length; t++) {
			if(ruleMatch[t]) {
				this.rules[t-1].handler(this);
				this.rulesRegExp.lastIndex = this.nextMatch;
				break;
			}
		}
		// Get the next match
		ruleMatch = this.rulesRegExp.exec(this.source);
	}
	// Output any text after the last match
	if(this.nextMatch < this.source.length) {
		this.outputText(this.output,this.nextMatch,this.source.length);
		this.nextMatch = this.source.length;
	}
	// Restore the output pointer
	this.output = oldOutput;
};

WikiTextParser.prototype.subWikifyTerm = function(output,terminatorRegExp) {
	// subWikify can be indirectly recursive, so we need to save the old output pointer
	var oldOutput = this.output;
	this.output = output;
	// Get the first matches for the rule and terminator RegExps
	terminatorRegExp.lastIndex = this.nextMatch;
	var terminatorMatch = terminatorRegExp.exec(this.source);
	this.rulesRegExp.lastIndex = this.nextMatch;
	var ruleMatch = this.rulesRegExp.exec(terminatorMatch ? this.source.substr(0,terminatorMatch.index) : this.source);
	while(terminatorMatch || ruleMatch) {
		// Check for a terminator match before the next rule match
		if(terminatorMatch && (!ruleMatch || terminatorMatch.index <= ruleMatch.index)) {
			// Output any text before the match
			if(terminatorMatch.index > this.nextMatch)
				this.outputText(this.output,this.nextMatch,terminatorMatch.index);
			// Set the match parameters
			this.matchText = terminatorMatch[1];
			this.matchLength = terminatorMatch[1].length;
			this.matchStart = terminatorMatch.index;
			this.nextMatch = this.matchStart + this.matchLength;
			// Restore the output pointer
			this.output = oldOutput;
			return;
		}
		// It must be a rule match; output any text before the match
		if(ruleMatch.index > this.nextMatch)
			this.outputText(this.output,this.nextMatch,ruleMatch.index);
		// Set the match parameters
		this.matchStart = ruleMatch.index;
		this.matchLength = ruleMatch[0].length;
		this.matchText = ruleMatch[0];
		this.nextMatch = this.rulesRegExp.lastIndex;
		// Figure out which rule matched and call its handler
		var t;
		for(t=1; t<ruleMatch.length; t++) {
			if(ruleMatch[t]) {
				this.rules[t-1].handler(this);
				this.rulesRegExp.lastIndex = this.nextMatch;
				break;
			}
		}
		// Get the next match
		terminatorRegExp.lastIndex = this.nextMatch;
		terminatorMatch = terminatorRegExp.exec(this.source);
		ruleMatch = this.rulesRegExp.exec(terminatorMatch ? this.source.substr(0,terminatorMatch.index) : this.source);
	}
	// Output any text after the last match
	if(this.nextMatch < this.source.length) {
		this.outputText(this.output,this.nextMatch,this.source.length);
		this.nextMatch = this.source.length;
	}
	// Restore the output pointer
	this.output = oldOutput;
};

exports["text/x-tiddlywiki"] = WikiTextParser;

})();
