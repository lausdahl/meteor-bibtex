// Write your package code here!

// Original work by Henrik Muehe (c) 2010
// CommonJS port by Mikola Lysenko 2013
// https://github.com/mikolalysenko/bibtex-parser
//
// Issues:
//  no comment handling within strings
//  no string concatenation
//  no variable values yet

// Grammar implemented here:
//  bibtex -> (string | preamble | comment | entry)*;
//  string -> '@STRING' '{' key_equals_value '}';
//  preamble -> '@PREAMBLE' '{' value '}';
//  comment -> '@COMMENT' '{' value '}';
//  entry -> '@' key '{' key ',' key_value_list '}';
//  key_value_list -> key_equals_value (',' key_equals_value)*;
//  key_equals_value -> key '=' value;
//  value -> value_quotes | value_braces | key;
//  value_quotes -> '"' .*? '"'; // not quite
//  value_braces -> '{' .*? '"'; // not quite
//
// ------------------------------------------------------------
//
// wrapped into a meteor package and extended with latex commands and
// author parseing by Christian Fritz
//
// TODO:
// author parsing, author_short


function BibtexParser() {
    this.pos = 0;
    this.lastStart = 0;
    this.input = "";
    
    this.entries = {};
    this.comments = [];
    this.strings = {
        jan: "January",
        feb: "February",
        mar: "March",      
        apr: "April",
        may: "May",
        jun: "June",
        jul: "July",
        aug: "August",
        sep: "September",
        oct: "October",
        nov: "November",
        dec: "December"
    };
    this.currentKey = "";
    this.currentEntry = "";
    

    this.setInput = function(t) {
        this.input = t;
    }
    
    this.getEntries = function() {
        return this.entries;
    }

    this.isWhitespace = function(s) {
        return (s == ' ' || s == '\r' || s == '\t' || s == '\n');
    }

    this.match = function(s) {
        this.skipWhitespace();
        if (this.input.substring(this.pos, this.pos+s.length) == s) {
            this.pos += s.length;
        } else {
            throw "Token mismatch, expected " + s + ", found " + this.input.substring(this.pos);
        }
        this.skipWhitespace();
    }

    this.tryMatch = function(s) {
        this.skipWhitespace();
        if (this.input.substring(this.pos, this.pos+s.length) == s) {
            return true;
        } else {
            return false;
        }
        this.skipWhitespace();
    }

    this.skipWhitespace = function() {
        while (this.isWhitespace(this.input[this.pos])) {
            this.pos++;
        }
        if (this.input[this.pos] == "%") {
            while(this.input[this.pos] != "\n") {
                this.pos++;
            }
            this.skipWhitespace();
        }
    }

    this.value_braces = function() {
        var bracecount = 0;
        this.match("{");
        var start = this.pos;
        while(true) {
            if (this.input[this.pos] == '}' && this.input[this.pos-1] != '\\') {
                if (bracecount > 0) {
                    bracecount--;
                } else {
                    var end = this.pos;
                    this.match("}");
                    return this.input.substring(start, end);
                }
            } else if (this.input[this.pos] == '{') {
                bracecount++;
            } else if (this.pos == this.input.length-1) {
                throw "Unterminated value";
            }
            this.pos++;
        }
    }

    this.value_quotes = function() {
        this.match('"');
        var start = this.pos;
        while(true) {
            if (this.input[this.pos] == '"' && this.input[this.pos-1] != '\\') {
                var end = this.pos;
                this.match('"');
                return this.input.substring(start, end);
            } else if (this.pos == this.input.length-1) {
                throw "Unterminated value:" + this.input.substring(start);
            }
            this.pos++;
        }
    }

    this.single_value = function() {
        var start = this.pos;
        if (this.tryMatch("{")) {
            return this.convert(this.value_braces());
        } else if (this.tryMatch('"')) {
            return this.convert(this.value_quotes());
        } else {
            var k = this.key();
            if (this.strings[k.toLowerCase()]) {
                return this.strings[k];
            } else if (k.match("^[0-9]+$")) {
                return k;
            } else {
                throw "Value expected:" + this.input.substring(start);
            }
        }
        return value;     
    }
    
    this.value = function() {
        var values = [];
        values.push(this.single_value());
        while (this.tryMatch("#")) {
            this.match("#");
            values.push(this.single_value());
        }
        return values.join("");
    }

    this.key = function() {
        var start = this.pos;
        while(true) {
            if (this.pos == this.input.length) {
                throw "Runaway key";
            }
            
            if (this.input[this.pos].match("[a-zA-Z0-9_:\\./-]")) {
                this.pos++
            } else {
                return this.input.substring(start, this.pos).toLowerCase();
            }
        }
    }

    this.key_equals_value = function() {
        var key = this.key();
        if (this.tryMatch("=")) {
            this.match("=");
            var val = this.value();

            if (key == "author"
                || key == "editor") {
                // Parse names
                val = val.split(" and ");
                if (val.length == 1) {
                    // no " and "s, try splitting by every other comma
                    var result = val[0].match(/[^,]+,[^,]+/g);
                    if (result) {
                        val = result;
                    }
                }                
            }
            
            return [ key, val ];
        } else {
            throw "... = value expected, equals sign missing:" + this.input.substring(this.pos);
        }
    }

    this.key_value_list = function() {
        var kv = this.key_equals_value();
        this.entries[this.currentEntry][kv[0]] = kv[1];
        while (this.tryMatch(",")) {
            this.match(",");
            // fixes problems with commas at the end of a list
            if (this.tryMatch("}")) {
                break;
            }
            kv = this.key_equals_value();
            this.entries[this.currentEntry][kv[0]] = kv[1];
        }
    }

    this.entry_body = function(d) {
        this.currentEntry = this.key();
        this.entries[this.currentEntry] = {
            bibtype: d.substring(1).toLowerCase(),
            type: d.substring(1).toLowerCase()
        };
        this.match(",");
        this.key_value_list();
    }

    this.directive = function () {
        this.match("@");
        return "@"+this.key();
    }

    this.string = function () {
        var kv = this.key_equals_value();
        this.strings[kv[0].toLowerCase()] = kv[1];
    }

    this.preamble = function() {
        this.value();
    }

    this.comment = function() {
        var start = this.pos;
        while(true) {
            if (this.pos == this.input.length) {
                throw "Runaway comment";
            }
            
            if (this.input[this.pos] != '}') {
                this.pos++
            } else {
                this.comments.push(this.input.substring(start, this.pos));
                return;
            }
        }
    }

    this.entry = function(d) {
        return this.entry_body(d);
    }

    this.bibtex = function() {
        while(this.tryMatch("@")) {
            this.lastStart = this.pos;
            var d = this.directive().toUpperCase();
            this.match("{");
            var isEntry = false;
            if (d == "@STRING") {
                this.string();
            } else if (d == "@PREAMBLE") {
                this.preamble();
            } else if (d == "@COMMENT") {
                this.comment();
            } else {
                key = this.entry(d);
                isEntry = true;
            }            
            this.match("}");
            if (isEntry) {
                var entry = this.entries[this.currentEntry];
                entry.bibtex =
                    this.input.substr(this.lastStart,
                                      this.pos - this.lastStart);

                // author_short:
                _.each(["author", "editor"], function(role) {
                    if (entry[role]) {
                        entry[role + "_short"] = _.map(entry[role], function(a) {
                            // #HERE, TODO
                            return a;
                        });
                    }
                });
            }
        }

        // this.entries['@comments'] = this.comments;
    }


    this.convert = function(raw) {
        // Convert Latex/Bibtex special characters to UTF-8 equivalents        
        // for (var i = 0; i < this.CHARCONV_.length; i++) {
        //     var re = this.CHARCONV_[i][0];
        //     var rep = this.CHARCONV_[i][1];
        //     raw = raw.replace(re, rep);
        // }
        // #HERE: repeat this step without braces in the [i][0] regex;

        var self = this;
        var rtv = raw.replace(this.regex, function(latex) {
            console.log("matched", latex);
            return self.mapping[latex];
        });

        // now run through once more and remove all { and } outside of
        // $'s:
        var mathmode = false;
        rtv = _.reduce(rtv, function(memo, character) {
            if ((character != "{" && character !== "}")
               || mathmode) {
                memo += character;
            }
            if (character == "$") {
                mathmode = !mathmode;
            }
            return memo;
        }, "");
        
        return rtv;
        // return raw;
    }  

    
    // console.log("start");

    var unicode = xml2js.parseStringSync(Assets.getText("unicode.xml"));
    // var unicode = xml2js.parseStringSync(Assets.getText("test.xml"));
    // console.log("unicode", unicode);
    this.mapping =
        _.reduce(unicode.charlist.character, function(memo, character) {
            // console.log(character);
            var id = character.$.id;
            if (character.latex
                // do not replace single characters
                && character.latex[0].replace("{","").replace("}","").length > 1
                && character.latex[0].indexOf("\\") >= 0
                && id.substr(0,2) == "U0"
                && character.$.type != "diacritic" // things like \^ and \'
               ) {
                var latex = character.latex[0];
                var unicode = String.fromCharCode(
                    parseInt( id.substr( id.length - 5), 16));
                // console.log(latex, unicode, parseInt( id.substr( id.length - 5), 16));
                if (!memo[latex]) { // do not override existing (e.g.,
                                    // \'{E}) exists twice
                    memo[latex] = unicode;
                    if (latex.match("{.}$")) {
                        memo[latex.replace("{","").replace("}","")] = unicode;
                    }
                }
            }
            return memo;
        }, {});
    // console.log("mapping", this.mapping);
    // console.log("mapping length", this.mapping.length);
    if (this.mapping == {}) throw new Meteor.Error("mapping is empty!");
    this.regex = new RegExp(
        _.map(_.keys(this.mapping), function(latex) {
            latex = latex.replace(/\\/g, "\\\\");
            _.each(["*", ".", "+", "?", "{", "}", "(", ")"],
                   function(c) {
                       latex = latex.replace(
                           new RegExp("\\" + c, "g"), "\\" + c);
                   });
            return latex;
        }).join("|"), "g");
    
    // console.log("regex", this.regex);
    // console.log("done");   
}

var b = new BibtexParser();

//Runs the parser
Bibtex = {
    parse: function(input) {
        b.setInput(input);
        b.bibtex();
        return b.entries;
    }
};