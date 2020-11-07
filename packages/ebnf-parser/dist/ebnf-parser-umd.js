(function (global, factory) {
    typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('@gerhobbelt/xregexp'), require('@gerhobbelt/json5'), require('fs'), require('path'), require('recast'), require('@babel/core'), require('assert')) :
    typeof define === 'function' && define.amd ? define(['@gerhobbelt/xregexp', '@gerhobbelt/json5', 'fs', 'path', 'recast', '@babel/core', 'assert'], factory) :
    (global = typeof globalThis !== 'undefined' ? globalThis : global || self, global['ebnf-parser'] = factory(global.XRegExp, null, global.fs, global.path$1, global.recast, global.babel, global.assert$1));
}(this, (function (XRegExp, json5, fs, path$1, recast, babel, assert$1) { 'use strict';

    function _interopDefaultLegacy (e) { return e && typeof e === 'object' && 'default' in e ? e : { 'default': e }; }

    var XRegExp__default = /*#__PURE__*/_interopDefaultLegacy(XRegExp);
    var fs__default = /*#__PURE__*/_interopDefaultLegacy(fs);
    var path__default = /*#__PURE__*/_interopDefaultLegacy(path$1);
    var recast__default = /*#__PURE__*/_interopDefaultLegacy(recast);
    var assert__default = /*#__PURE__*/_interopDefaultLegacy(assert$1);

    // Return TRUE if `src` starts with `searchString`. 
    function startsWith(src, searchString) {
        return src.substr(0, searchString.length) === searchString;
    }



    // tagged template string helper which removes the indentation common to all
    // non-empty lines: that indentation was added as part of the source code
    // formatting of this lexer spec file and must be removed to produce what
    // we were aiming for.
    //
    // Each template string starts with an optional empty line, which should be
    // removed entirely, followed by a first line of error reporting content text,
    // which should not be indented at all, i.e. the indentation of the first
    // non-empty line should be treated as the 'common' indentation and thus
    // should also be removed from all subsequent lines in the same template string.
    //
    // See also: https://developer.mozilla.org/en/docs/Web/JavaScript/Reference/Template_literals
    function rmCommonWS(strings, ...values) {
        // As `strings[]` is an array of strings, each potentially consisting
        // of multiple lines, followed by one(1) value, we have to split each
        // individual string into lines to keep that bit of information intact.
        // 
        // We assume clean code style, hence no random mix of tabs and spaces, so every
        // line MUST have the same indent style as all others, so `length` of indent
        // should suffice, but the way we coded this is stricter checking as we look
        // for the *exact* indenting=leading whitespace in each line.
        var indent_str = null;
        var src = strings.map(function splitIntoLines(s) {
            var a = s.split('\n');
            
            indent_str = a.reduce(function analyzeLine(indent_str, line, index) {
                // only check indentation of parts which follow a NEWLINE:
                if (index !== 0) {
                    var m = /^(\s*)\S/.exec(line);
                    // only non-empty ~ content-carrying lines matter re common indent calculus:
                    if (m) {
                        if (indent_str == null) {
                            indent_str = m[1];
                        } else if (m[1].length < indent_str.length) {
                            indent_str = m[1];
                        }
                    }
                }
                return indent_str;
            }, indent_str);

            return a;
        });

        // Also note: due to the way we format the template strings in our sourcecode,
        // the last line in the entire template must be empty when it has ANY trailing
        // whitespace:
        var a = src[src.length - 1];
        a[a.length - 1] = a[a.length - 1].replace(/\s+$/, '');

        // Done removing common indentation.
        // 
        // Process template string partials now, but only when there's
        // some actual UNindenting to do:
        if (indent_str) {
            for (var i = 0, len = src.length; i < len; i++) {
                var a = src[i];
                // only correct indentation at start of line, i.e. only check for
                // the indent after every NEWLINE ==> start at j=1 rather than j=0
                for (var j = 1, linecnt = a.length; j < linecnt; j++) {
                    if (startsWith(a[j], indent_str)) {
                        a[j] = a[j].substr(indent_str.length);
                    }
                }
            }
        }

        // now merge everything to construct the template result:
        var rv = [];
        for (var i = 0, len = values.length; i < len; i++) {
            rv.push(src[i].join('\n'));
            rv.push(values[i]);
        }
        // the last value is always followed by a last template string partial:
        rv.push(src[i].join('\n'));

        var sv = rv.join('');
        return sv;
    }

    // Convert dashed option keys to Camel Case, e.g. `camelCase('camels-have-one-hump')` => `'camelsHaveOneHump'`
    /** @public */
    function camelCase(s) {
        // Convert first character to lowercase
        return s.replace(/^\w/, function (match) {
            return match.toLowerCase();
        })
        .replace(/-\w/g, function (match) {
            var c = match.charAt(1);
            var rv = c.toUpperCase();
            // do not mutate 'a-2' to 'a2':
            if (c === rv && c.match(/\d/)) {
                return match;
            }
            return rv;
        })
    }

    // Convert dashed option keys and other inputs to Camel Cased legal JavaScript identifiers
    /** @public */
    function mkIdentifier(s) {
        s = '' + s;
        return s
        // Convert dashed ids to Camel Case (though NOT lowercasing the initial letter though!), 
        // e.g. `camelCase('camels-have-one-hump')` => `'camelsHaveOneHump'`
        .replace(/-\w/g, function (match) {
            var c = match.charAt(1);
            var rv = c.toUpperCase();
            // do not mutate 'a-2' to 'a2':
            if (c === rv && c.match(/\d/)) {
                return match;
            }
            return rv;
        })
        // cleanup: replace any non-suitable character series to a single underscore:
        .replace(/^[^\w_]/, '_')
        // do not accept numerics at the leading position, despite those matching regex `\w`:
        .replace(/^\d/, '_')
        .replace(/[^\w\d_]+/g, '_')
        // and only accept multiple (double, not triple) underscores at start or end of identifier name:
        .replace(/^__+/, '#')
        .replace(/__+$/, '#')
        .replace(/_+/g, '_')
        .replace(/#/g, '__');
    }

    // Check if the start of the given input matches a regex expression.
    // Return the length of the regex expression or -1 if none was found.
    /** @public */
    function scanRegExp(s) {
        s = '' + s;
        // code based on Esprima scanner: `Scanner.prototype.scanRegExpBody()`
        var index = 0;
        var length = s.length;
        var ch = s[index];
        //assert.assert(ch === '/', 'Regular expression literal must start with a slash');
        var str = s[index++];
        var classMarker = false;
        var terminated = false;
        while (index < length) {
            ch = s[index++];
            str += ch;
            if (ch === '\\') {
                ch = s[index++];
                // https://tc39.github.io/ecma262/#sec-literals-regular-expression-literals
                if (isLineTerminator(ch.charCodeAt(0))) {
                    break;             // UnterminatedRegExp
                }
                str += ch;
            }
            else if (isLineTerminator(ch.charCodeAt(0))) {
                break;                 // UnterminatedRegExp
            }
            else if (classMarker) {
                if (ch === ']') {
                    classMarker = false;
                }
            }
            else {
                if (ch === '/') {
                    terminated = true;
                    break;
                }
                else if (ch === '[') {
                    classMarker = true;
                }
            }
        }
        if (!terminated) {
            return -1;                  // UnterminatedRegExp
        }
        return index;
    }


    // https://tc39.github.io/ecma262/#sec-line-terminators
    function isLineTerminator(cp) {
        return (cp === 0x0A) || (cp === 0x0D) || (cp === 0x2028) || (cp === 0x2029);
    }

    // Check if the given input can be a legal identifier-to-be-camelcased:
    // use this function to check if the way the identifier is written will
    // produce a sensible & comparable identifier name using the `mkIdentifier'
    // API - for humans that transformation should be obvious/trivial in
    // order to prevent confusion.
    /** @public */
    function isLegalIdentifierInput(s) {
        s = '' + s;
        // Convert dashed ids to Camel Case (though NOT lowercasing the initial letter though!), 
        // e.g. `camelCase('camels-have-one-hump')` => `'camelsHaveOneHump'`
        s = s
        .replace(/-\w/g, function (match) {
            var c = match.charAt(1);
            var rv = c.toUpperCase();
            // do not mutate 'a-2' to 'a2':
            if (c === rv && c.match(/\d/)) {
                return match;
            }
            return rv;
        });
        var alt = mkIdentifier(s);
        return alt === s;
    }

    // properly quote and escape the given input string
    function dquote(s) {
        var sq = (s.indexOf('\'') >= 0);
        var dq = (s.indexOf('"') >= 0);
        if (sq && dq) {
            s = s.replace(/"/g, '\\"');
            dq = false;
        }
        if (dq) {
            s = '\'' + s + '\'';
        }
        else {
            s = '"' + s + '"';
        }
        return s;
    }

    //



    function chkBugger(src) {
        src = String(src);
        if (src.match(/\bcov_\w+/)) {
            console.error('### ISTANBUL COVERAGE CODE DETECTED ###\n', src);
        }
    }




    // Helper function: pad number with leading zeroes
    function pad(n, p) {
        p = p || 2;
        var rv = '0000' + n;
        return rv.slice(-p);
    }


    // attempt to dump in one of several locations: first winner is *it*!
    function dumpSourceToFile(sourcecode, errname, err_id, options, ex) {
        var dumpfile;
        options = options || {};

        try {
            var dumpPaths = [(options.outfile ? path__default['default'].dirname(options.outfile) : null), options.inputPath, process.cwd()];
            var dumpName = path__default['default'].basename(options.inputFilename || options.moduleName || (options.outfile ? path__default['default'].dirname(options.outfile) : null) || options.defaultModuleName || errname)
            .replace(/\.[a-z]{1,5}$/i, '')          // remove extension .y, .yacc, .jison, ...whatever
            .replace(/[^a-z0-9_]/ig, '_');          // make sure it's legal in the destination filesystem: the least common denominator.
            if (dumpName === '' || dumpName === '_') {
                dumpName = '__bugger__';
            }
            err_id = err_id || 'XXX';

            var ts = new Date();
            var tm = ts.getUTCFullYear() +
                '_' + pad(ts.getUTCMonth() + 1) +
                '_' + pad(ts.getUTCDate()) +
                'T' + pad(ts.getUTCHours()) +
                '' + pad(ts.getUTCMinutes()) +
                '' + pad(ts.getUTCSeconds()) +
                '.' + pad(ts.getUTCMilliseconds(), 3) +
                'Z';

            dumpName += '.fatal_' + err_id + '_dump_' + tm + '.js';

            for (var i = 0, l = dumpPaths.length; i < l; i++) {
                if (!dumpPaths[i]) {
                    continue;
                }

                try {
                    dumpfile = path__default['default'].normalize(dumpPaths[i] + '/' + dumpName);
                    fs__default['default'].writeFileSync(dumpfile, sourcecode, 'utf8');
                    console.error("****** offending generated " + errname + " source code dumped into file: ", dumpfile);
                    break;          // abort loop once a dump action was successful!
                } catch (ex3) {
                    //console.error("generated " + errname + " source code fatal DUMPING error ATTEMPT: ", i, " = ", ex3.message, " -- while attempting to dump into file: ", dumpfile, "\n", ex3.stack);
                    if (i === l - 1) {
                        throw ex3;
                    }
                }
            }
        } catch (ex2) {
            console.error("generated " + errname + " source code fatal DUMPING error: ", ex2.message, " -- while attempting to dump into file: ", dumpfile, "\n", ex2.stack);
        }

        // augment the exception info, when available:
        if (ex) {
            ex.offending_source_code = sourcecode;
            ex.offending_source_title = errname;
            ex.offending_source_dumpfile = dumpfile;
        }    
    }




    //
    // `code_execution_rig` is a function which gets executed, while it is fed the `sourcecode` as a parameter.
    // When the `code_execution_rig` crashes, its failure is caught and (using the `options`) the sourcecode
    // is dumped to file for later diagnosis.
    //
    // Two options drive the internal behaviour:
    //
    // - options.dumpSourceCodeOnFailure        -- default: FALSE
    // - options.throwErrorOnCompileFailure     -- default: FALSE
    //
    // Dumpfile naming and path are determined through these options:
    //
    // - options.outfile
    // - options.inputPath
    // - options.inputFilename
    // - options.moduleName
    // - options.defaultModuleName
    //
    function exec_and_diagnose_this_stuff(sourcecode, code_execution_rig, options, title) {
        options = options || {};
        var errname = "" + (title || "exec_test");
        var err_id = errname.replace(/[^a-z0-9_]/ig, "_");
        if (err_id.length === 0) {
            err_id = "exec_crash";
        }
        const debug = 0;

        var p;
        try {
            // p = eval(sourcecode);
            if (typeof code_execution_rig !== 'function') {
                throw new Error("safe-code-exec-and-diag: code_execution_rig MUST be a JavaScript function");
            }
            chkBugger(sourcecode);
            p = code_execution_rig.call(this, sourcecode, options, errname, debug);
        } catch (ex) {
            
            if (options.dumpSourceCodeOnFailure) {
                dumpSourceToFile(sourcecode, errname, err_id, options, ex);
            }
            
            if (options.throwErrorOnCompileFailure) {
                throw ex;
            }
        }
        return p;
    }






    var code_exec = {
        exec: exec_and_diagnose_this_stuff,
        dump: dumpSourceToFile
    };

    //

    assert__default['default'](recast__default['default']);
    var types = recast__default['default'].types;
    assert__default['default'](types);
    var namedTypes = types.namedTypes;
    assert__default['default'](namedTypes);
    var b = types.builders;
    assert__default['default'](b);
    // //assert(astUtils);




    function parseCodeChunkToAST(src, options) {
        src = src
        .replace(/@/g, '\uFFDA')
        .replace(/#/g, '\uFFDB')
        ;
        var ast = recast__default['default'].parse(src);
        return ast;
    }


    function compileCodeToES5(src, options) {
        options = Object.assign({}, {
          ast: true,
          code: true,
          sourceMaps: true,
          comments: true,
          filename: 'compileCodeToES5.js',
          sourceFileName: 'compileCodeToES5.js',
          sourceRoot: '.',
          sourceType: 'module',

          babelrc: false,
          
          ignore: [
            "node_modules/**/*.js"
          ],
          compact: false,
          retainLines: false,
          presets: [
            ["@babel/preset-env", {
              targets: {
                browsers: ["last 2 versions"],
                node: "8.0"
              }
            }]
          ]
        }, options);

        return babel.transformSync(src, options); // => { code, map, ast }
    }


    function prettyPrintAST(ast, options) {
        var new_src;
        var options = options || {};
        const defaultOptions = { 
            tabWidth: 2,
            quote: 'single',
            arrowParensAlways: true,

            // Do not reuse whitespace (or anything else, for that matter)
            // when printing generically.
            reuseWhitespace: false
        };
        for (var key in defaultOptions) {
            if (options[key] === undefined) {
                options[key] = defaultOptions[key];
            }
        }

        var s = recast__default['default'].prettyPrint(ast, { 
            tabWidth: 2,
            quote: 'single',
            arrowParensAlways: true,

            // Do not reuse whitespace (or anything else, for that matter)
            // when printing generically.
            reuseWhitespace: false
        });
        new_src = s.code;

        new_src = new_src
        .replace(/\r\n|\n|\r/g, '\n')    // platform dependent EOL fixup
        // backpatch possible jison variables extant in the prettified code:
        .replace(/\uFFDA/g, '@')
        .replace(/\uFFDB/g, '#')
        ;

        return new_src;
    }




    // validate the given JavaScript snippet: does it compile?
    // 
    // Return either the parsed AST (object) or an error message (string). 
    function checkActionBlock(src, yylloc) {
        // make sure reasonable line numbers, etc. are reported in any
        // potential parse errors by pushing the source code down:
        if (yylloc && yylloc.first_line > 0) {
            var cnt = yylloc.first_line;
            var lines = new Array(cnt);
            src = lines.join('\n') + src;
        } 
        if (!src.trim()) {
            return false;
        }

        try {
            var rv = parseCodeChunkToAST(src);
            return false;
        } catch (ex) {
            return false;
        }
    }



    // The rough-and-ready preprocessor for any action code block:
    // this one trims off any surplus whitespace and removes any
    // trailing semicolons and/or wrapping `{...}` braces,
    // when such is easily possible *without having to actually
    // **parse** the `src` code block in order to do this safely*.
    // 
    // Returns the trimmed sourcecode which was provided via `src`.
    // 
    // Note: the `startMarker` argument is special in that a lexer/parser
    // can feed us the delimiter which started the code block here:
    // when the starting delimiter actually is `{` we can safely
    // remove the outer `{...}` wrapper (which then *will* be present!),
    // while otherwise we may *not* do so as complex/specially-crafted
    // code will fail when it was wrapped in other delimiters, e.g.
    // action code specs like this one:
    // 
    //              %{
    //                  {  // trimActionCode sees this one as outer-starting: WRONG
    //                      a: 1
    //                  };
    //                  {
    //                      b: 2
    //                  }  // trimActionCode sees this one as outer-ending: WRONG
    //              %}
    //              
    // Of course the example would be 'ludicrous' action code but the
    // key point here is that users will certainly be able to come up with 
    // convoluted code that is smarter than our simple regex-based
    // `{...}` trimmer in here!
    // 
    function trimActionCode(src, startMarker) {
        var s = src.trim();
        // remove outermost set of braces UNLESS there's
        // a curly brace in there anywhere: in that case
        // we should leave it up to the sophisticated
        // code analyzer to simplify the code!
        //
        // This is a very rough check as it will also look
        // inside code comments, which should not have
        // any influence.
        //
        // Nevertheless: this is a *safe* transform as
        // long as the code doesn't end with a C++-style
        // comment which happens to contain that closing
        // curly brace at the end!
        //
        // Also DO strip off any trailing optional semicolon,
        // which might have ended up here due to lexer rules
        // like this one:
        //
        //     [a-z]+              -> 'TOKEN';
        //
        // We can safely ditch any trailing semicolon(s) as
        // our code generator reckons with JavaScript's
        // ASI rules (Automatic Semicolon Insertion).
        //
        //
        // TODO: make this is real code edit without that
        // last edge case as a fault condition.
        if (startMarker === '{') {
            // code is wrapped in `{...}` for sure: remove the wrapping braces.
            s = s.replace(/^\{([^]*?)\}$/, '$1').trim();
        } else {
            // code may not be wrapped or otherwise non-simple: only remove
            // wrapping braces when we can guarantee they're the only ones there,
            // i.e. only exist as outer wrapping.
            s = s.replace(/^\{([^}]*)\}$/, '$1').trim();
        }
        s = s.replace(/;+$/, '').trim();
        return s;
    }





    var parse2AST = {
        parseCodeChunkToAST,
        compileCodeToES5,
        prettyPrintAST,
        checkActionBlock,
        trimActionCode,
    };

    function chkBugger$1(src) {
        src = String(src);
        if (src.match(/\bcov_\w+/)) {
            console.error('### ISTANBUL COVERAGE CODE DETECTED ###\n', src);
        }
    }


    /// HELPER FUNCTION: print the function in source code form, properly indented.
    /** @public */
    function printFunctionSourceCode(f) {
        var src = String(f);
        chkBugger$1(src);
        return src;
    }



    const funcRe = /^function[\s\r\n]*[^\(]*\(([^\)]*)\)[\s\r\n]*\{([^]*?)\}$/;
    const arrowFuncRe = /^(?:(?:\(([^\)]*)\))|(?:([^\(\)]+)))[\s\r\n]*=>[\s\r\n]*(?:(?:\{([^]*?)\})|(?:(([^\s\r\n\{)])[^]*?)))$/;

    /// HELPER FUNCTION: print the function **content** in source code form, properly indented,
    /// ergo: produce the code for inlining the function.
    /// 
    /// Also supports ES6's Arrow Functions:
    /// 
    /// ```
    /// function a(x) { return x; }        ==> 'return x;'
    /// function (x)  { return x; }        ==> 'return x;'
    /// (x) => { return x; }               ==> 'return x;'
    /// (x) => x;                          ==> 'return x;'
    /// (x) => do(1), do(2), x;            ==> 'return (do(1), do(2), x);'
    /// 
    /** @public */
    function printFunctionSourceCodeContainer(f) {
        var action = printFunctionSourceCode(f).trim();
        var args;

        // Also cope with Arrow Functions (and inline those as well?).
        // See also https://github.com/zaach/jison-lex/issues/23
        var m = funcRe.exec(action);
        if (m) {
            args = m[1].trim();
            action = m[2].trim();
        } else {
            m = arrowFuncRe.exec(action);
            if (m) {
                if (m[2]) {
                    // non-bracketed arguments:
                    args = m[2].trim();
                } else {
                    // bracketed arguments: may be empty args list!
                    args = m[1].trim();
                }
                if (m[5]) {
                    // non-bracketed version: implicit `return` statement!
                    //
                    // Q: Must we make sure we have extra braces around the return value 
                    // to prevent JavaScript from inserting implit EOS (End Of Statement) 
                    // markers when parsing this, when there are newlines in the code?
                    // A: No, we don't have to as arrow functions rvalues suffer from this
                    // same problem, hence the arrow function's programmer must already
                    // have formatted the code correctly.
                    action = m[4].trim();
                    action = 'return ' + action + ';';
                } else {
                    action = m[3].trim();
                }
            } else {
                var e = new Error('Cannot extract code from function');
                e.subject = action;
                throw e;
            }
        }
        return {
            args: args,
            code: action,
        };
    }







    var stringifier = {
    	printFunctionSourceCode,
    	printFunctionSourceCodeContainer,
    };

    // 
    // 
    // 
    function detectIstanbulGlobal() {
        const gcv = "__coverage__";
        const globalvar = new Function('return this')();
        var coverage = globalvar[gcv];
        return coverage || false;
    }

    //
    // Helper library for safe code execution/compilation
    //
    // MIT Licensed
    //
    //
    // This code is intended to help test and diagnose arbitrary regexes, answering questions like this:
    //
    // - is this a valid regex, i.e. does it compile?
    // - does it have captures, and if yes, how many?
    //

    //import XRegExp from '@gerhobbelt/xregexp';


    // validate the given regex.
    //
    // You can specify an (advanced or regular) regex class as a third parameter.
    // The default assumed is the standard JavaScript `RegExp` class.
    //
    // Return FALSE when there's no failure, otherwise return an `Error` info object.
    function checkRegExp(re_src, re_flags, XRegExp) {
        var re;

        // were we fed a RegExp object or a string?
        if (re_src
            && typeof re_src.source === 'string'
            && typeof re_src.flags === 'string'
            && typeof re_src.toString === 'function'
            && typeof re_src.test === 'function'
            && typeof re_src.exec === 'function'
        ) {
            // we're looking at a RegExp (or XRegExp) object, so we can trust the `.source` member
            // and the `.toString()` method to produce something that's compileable by XRegExp
            // at least...
            if (!re_flags || re_flags === re_src.flags) {
                // no change of flags: we assume it's okay as it's already contained
                // in an RegExp or XRegExp object
                return false;
            }
        }
        // we DO accept empty regexes: `''` but we DO NOT accept null/undefined
        if (re_src == null) {
            return new Error('invalid regular expression source: ' + re_src);
        }

        re_src = '' + re_src;
        if (re_flags == null) {
            re_flags = undefined;       // `new RegExp(..., flags)` will barf a hairball when `flags===null`
        } else {
            re_flags = '' + re_flags;
        }

        XRegExp = XRegExp || RegExp;

        try {
            re = new XRegExp(re_src, re_flags);
        } catch (ex) {
            return ex;
        }
        return false;
    }

    // provide some info about the given regex.
    //
    // You can specify an (advanced or regular) regex class as a third parameter.
    // The default assumed is the standard JavaScript `RegExp` class.
    //
    // Return FALSE when the input is not a legal regex.
    function getRegExpInfo(re_src, re_flags, XRegExp) {
        var re1, re2, m1, m2;

        // were we fed a RegExp object or a string?
        if (re_src
            && typeof re_src.source === 'string'
            && typeof re_src.flags === 'string'
            && typeof re_src.toString === 'function'
            && typeof re_src.test === 'function'
            && typeof re_src.exec === 'function'
        ) {
            // we're looking at a RegExp (or XRegExp) object, so we can trust the `.source` member
            // and the `.toString()` method to produce something that's compileable by XRegExp
            // at least...
            if (!re_flags || re_flags === re_src.flags) {
                // no change of flags: we assume it's okay as it's already contained
                // in an RegExp or XRegExp object
                re_flags = undefined;
            }
        } else if (re_src == null) {
            // we DO NOT accept null/undefined
            return false;
        } else {
            re_src = '' + re_src;

            if (re_flags == null) {
                re_flags = undefined;       // `new RegExp(..., flags)` will barf a hairball when `flags===null`
            } else {
                re_flags = '' + re_flags;
            }
        }

        XRegExp = XRegExp || RegExp;

        try {
            // A little trick to obtain the captures from a regex:
            // wrap it and append `(?:)` to ensure it matches
            // the empty string, then match it against it to
            // obtain the `match` array.
            re1 = new XRegExp(re_src, re_flags);
            re2 = new XRegExp('(?:' + re_src + ')|(?:)', re_flags);
            m1 = re1.exec('');
            m2 = re2.exec('');
            return {
                acceptsEmptyString: !!m1,
                captureCount: m2.length - 1
            };
        } catch (ex) {
            return false;
        }
    }








    var reHelpers = {
        checkRegExp: checkRegExp,
        getRegExpInfo: getRegExpInfo
    };

    var cycleref = [];
    var cyclerefpath = [];

    var linkref = [];
    var linkrefpath = [];

    var path = [];

    function shallow_copy(src) {
        if (typeof src === 'object') {
            if (src instanceof Array) {
                return src.slice();
            }

            var dst = {};
            if (src instanceof Error) {
                dst.name = src.name;
                dst.message = src.message;
                dst.stack = src.stack;
            }

            for (var k in src) {
                if (Object.prototype.hasOwnProperty.call(src, k)) {
                    dst[k] = src[k];
                }
            }
            return dst;
        }
        return src;
    }


    function shallow_copy_and_strip_depth(src, parentKey) {
        if (typeof src === 'object') {
            var dst;

            if (src instanceof Array) {
                dst = src.slice();
                for (var i = 0, len = dst.length; i < len; i++) {
                    path.push('[' + i + ']');
                    dst[i] = shallow_copy_and_strip_depth(dst[i], parentKey + '[' + i + ']');
                    path.pop();
                }
            } else {
                dst = {};
                if (src instanceof Error) {
                    dst.name = src.name;
                    dst.message = src.message;
                    dst.stack = src.stack;
                }

                for (var k in src) {
                    if (Object.prototype.hasOwnProperty.call(src, k)) {
                        var el = src[k];
                        if (el && typeof el === 'object') {
                            dst[k] = '[cyclic reference::attribute --> ' + parentKey + '.' + k + ']';
                        } else {
                            dst[k] = src[k];
                        }
                    }
                }
            }
            return dst;
        }
        return src;
    }


    function trim_array_tail(arr) {
        if (arr instanceof Array) {
            for (var len = arr.length; len > 0; len--) {
                if (arr[len - 1] != null) {
                    break;
                }
            }
            arr.length = len;
        }
    }

    function treat_value_stack(v) {
        if (v instanceof Array) {
            var idx = cycleref.indexOf(v);
            if (idx >= 0) {
                v = '[cyclic reference to parent array --> ' + cyclerefpath[idx] + ']';
            } else {
                idx = linkref.indexOf(v);
                if (idx >= 0) {
                    v = '[reference to sibling array --> ' + linkrefpath[idx] + ', length = ' + v.length + ']';
                } else {
                    cycleref.push(v);
                    cyclerefpath.push(path.join('.'));
                    linkref.push(v);
                    linkrefpath.push(path.join('.'));

                    v = treat_error_infos_array(v);

                    cycleref.pop();
                    cyclerefpath.pop();
                }
            }
        } else if (v) {
            v = treat_object(v);
        }
        return v;
    }

    function treat_error_infos_array(arr) {
        var inf = arr.slice();
        trim_array_tail(inf);
        for (var key = 0, len = inf.length; key < len; key++) {
            var err = inf[key];
            if (err) {
                path.push('[' + key + ']');

                err = treat_object(err);

                if (typeof err === 'object') {
                    if (err.lexer) {
                        err.lexer = '[lexer]';
                    }
                    if (err.parser) {
                        err.parser = '[parser]';
                    }
                    trim_array_tail(err.symbol_stack);
                    trim_array_tail(err.state_stack);
                    trim_array_tail(err.location_stack);
                    if (err.value_stack) {
                        path.push('value_stack');
                        err.value_stack = treat_value_stack(err.value_stack);
                        path.pop();
                    }
                }

                inf[key] = err;

                path.pop();
            }
        }
        return inf;
    }

    function treat_lexer(l) {
        // shallow copy object:
        l = shallow_copy(l);
        delete l.simpleCaseActionClusters;
        delete l.rules;
        delete l.conditions;
        delete l.__currentRuleSet__;

        if (l.__error_infos) {
            path.push('__error_infos');
            l.__error_infos = treat_value_stack(l.__error_infos);
            path.pop();
        }

        return l;
    }

    function treat_parser(p) {
        // shallow copy object:
        p = shallow_copy(p);
        delete p.productions_;
        delete p.table;
        delete p.defaultActions;

        if (p.__error_infos) {
            path.push('__error_infos');
            p.__error_infos = treat_value_stack(p.__error_infos);
            path.pop();
        }

        if (p.__error_recovery_infos) {
            path.push('__error_recovery_infos');
            p.__error_recovery_infos = treat_value_stack(p.__error_recovery_infos);
            path.pop();
        }

        if (p.lexer) {
            path.push('lexer');
            p.lexer = treat_lexer(p.lexer);
            path.pop();
        }

        return p;
    }

    function treat_hash(h) {
        // shallow copy object:
        h = shallow_copy(h);

        if (h.parser) {
            path.push('parser');
            h.parser = treat_parser(h.parser);
            path.pop();
        }

        if (h.lexer) {
            path.push('lexer');
            h.lexer = treat_lexer(h.lexer);
            path.push();
        }

        return h;
    }

    function treat_error_report_info(e) {
        // shallow copy object:
        e = shallow_copy(e);
        
        if (e && e.hash) {
            path.push('hash');
            e.hash = treat_hash(e.hash);
            path.pop();
        }

        if (e.parser) {
            path.push('parser');
            e.parser = treat_parser(e.parser);
            path.pop();
        }

        if (e.lexer) {
            path.push('lexer');
            e.lexer = treat_lexer(e.lexer);
            path.pop();
        }    

        if (e.__error_infos) {
            path.push('__error_infos');
            e.__error_infos = treat_value_stack(e.__error_infos);
            path.pop();
        }

        if (e.__error_recovery_infos) {
            path.push('__error_recovery_infos');
            e.__error_recovery_infos = treat_value_stack(e.__error_recovery_infos);
            path.pop();
        }

        trim_array_tail(e.symbol_stack);
        trim_array_tail(e.state_stack);
        trim_array_tail(e.location_stack);
        if (e.value_stack) {
            path.push('value_stack');
            e.value_stack = treat_value_stack(e.value_stack);
            path.pop();
        }

        return e;
    }

    function treat_object(e) {
        if (e && typeof e === 'object') {
            var idx = cycleref.indexOf(e);
            if (idx >= 0) {
                // cyclic reference, most probably an error instance.
                // we still want it to be READABLE in a way, though:
                e = shallow_copy_and_strip_depth(e, cyclerefpath[idx]);
            } else {
                idx = linkref.indexOf(e);
                if (idx >= 0) {
                    e = '[reference to sibling --> ' + linkrefpath[idx] + ']';
                } else {
                    cycleref.push(e);
                    cyclerefpath.push(path.join('.'));
                    linkref.push(e);
                    linkrefpath.push(path.join('.'));

                    e = treat_error_report_info(e);
                    
                    cycleref.pop();
                    cyclerefpath.pop();
                }
            }
        }
        return e;
    }


    // strip off large chunks from the Error exception object before
    // it will be fed to a test log or other output.
    // 
    // Internal use in the unit test rigs.
    function trimErrorForTestReporting(e) {
        cycleref.length = 0;
        cyclerefpath.length = 0;
        linkref.length = 0;
        linkrefpath.length = 0;
        path = ['*'];

        if (e) {
            e = treat_object(e);
        }

        cycleref.length = 0;
        cyclerefpath.length = 0;
        linkref.length = 0;
        linkrefpath.length = 0;
        path = ['*'];

        return e;
    }

    var helpers = {
        rmCommonWS,
        camelCase,
        mkIdentifier,
        isLegalIdentifierInput,
        scanRegExp,
        dquote,
        trimErrorForTestReporting,

        checkRegExp: reHelpers.checkRegExp,
        getRegExpInfo: reHelpers.getRegExpInfo,

        exec: code_exec.exec,
        dump: code_exec.dump,

        parseCodeChunkToAST: parse2AST.parseCodeChunkToAST,
        compileCodeToES5: parse2AST.compileCodeToES5,
        prettyPrintAST: parse2AST.prettyPrintAST,
        checkActionBlock: parse2AST.checkActionBlock,
        trimActionCode: parse2AST.trimActionCode,

        printFunctionSourceCode: stringifier.printFunctionSourceCode,
        printFunctionSourceCodeContainer: stringifier.printFunctionSourceCodeContainer,

        detectIstanbulGlobal,
    };

    // See also:
    // http://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/#35881508
    // but we keep the prototype.constructor and prototype.name assignment lines too for compatibility
    // with userland code which might access the derived class in a 'classic' way.
    function JisonParserError(msg, hash) {

        Object.defineProperty(this, 'name', {
            enumerable: false,
            writable: false,
            value: 'JisonParserError'
        });

        if (msg == null) msg = '???';

        Object.defineProperty(this, 'message', {
            enumerable: false,
            writable: true,
            value: msg
        });

        this.hash = hash;

        var stacktrace;
        if (hash && hash.exception instanceof Error) {
            var ex2 = hash.exception;
            this.message = ex2.message || msg;
            stacktrace = ex2.stack;
        }
        if (!stacktrace) {
            if (Error.hasOwnProperty('captureStackTrace')) {        // V8/Chrome engine
                Error.captureStackTrace(this, this.constructor);
            } else {
                stacktrace = (new Error(msg)).stack;
            }
        }
        if (stacktrace) {
            Object.defineProperty(this, 'stack', {
                enumerable: false,
                writable: false,
                value: stacktrace
            });
        }
    }

    if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(JisonParserError.prototype, Error.prototype);
    } else {
        JisonParserError.prototype = Object.create(Error.prototype);
    }
    JisonParserError.prototype.constructor = JisonParserError;
    JisonParserError.prototype.name = 'JisonParserError';




            // helper: reconstruct the productions[] table
            function bp(s) {
                var rv = [];
                var p = s.pop;
                var r = s.rule;
                for (var i = 0, l = p.length; i < l; i++) {
                    rv.push([
                        p[i],
                        r[i]
                    ]);
                }
                return rv;
            }
        




            // helper: reconstruct the 'goto' table
            function bt(s) {
                var rv = [];
                var d = s.len;
                var y = s.symbol;
                var t = s.type;
                var a = s.state;
                var m = s.mode;
                var g = s.goto;
                for (var i = 0, l = d.length; i < l; i++) {
                    var n = d[i];
                    var q = {};
                    for (var j = 0; j < n; j++) {
                        var z = y.shift();
                        switch (t.shift()) {
                        case 2:
                            q[z] = [
                                m.shift(),
                                g.shift()
                            ];
                            break;

                        case 0:
                            q[z] = a.shift();
                            break;

                        default:
                            // type === 1: accept
                            q[z] = [
                                3
                            ];
                        }
                    }
                    rv.push(q);
                }
                return rv;
            }
        


            // helper: runlength encoding with increment step: code, length: step (default step = 0)
            // `this` references an array
            function s(c, l, a) {
                a = a || 0;
                for (var i = 0; i < l; i++) {
                    this.push(c);
                    c += a;
                }
            }

            // helper: duplicate sequence from *relative* offset and length.
            // `this` references an array
            function c(i, l) {
                i = this.length - i;
                for (l += i; i < l; i++) {
                    this.push(this[i]);
                }
            }

            // helper: unpack an array using helpers and data, all passed in an array argument 'a'.
            function u(a) {
                var rv = [];
                for (var i = 0, l = a.length; i < l; i++) {
                    var e = a[i];
                    // Is this entry a helper function?
                    if (typeof e === 'function') {
                        i++;
                        e.apply(rv, a[i]);
                    } else {
                        rv.push(e);
                    }
                }
                return rv;
            }
        

    var parser = {
        // Code Generator Information Report
        // ---------------------------------
        //
        // Options:
        //
        //   default action mode: ............. ["classic","merge"]
        //   test-compile action mode: ........ "parser:*,lexer:*"
        //   try..catch: ...................... true
        //   default resolve on conflict: ..... true
        //   on-demand look-ahead: ............ false
        //   error recovery token skip maximum: 3
        //   yyerror in parse actions is: ..... NOT recoverable,
        //   yyerror in lexer actions and other non-fatal lexer are:
        //   .................................. NOT recoverable,
        //   debug grammar/output: ............ false
        //   has partial LR conflict upgrade:   true
        //   rudimentary token-stack support:   false
        //   parser table compression mode: ... 2
        //   export debug tables: ............. false
        //   export *all* tables: ............. false
        //   module type: ..................... es
        //   parser engine type: .............. lalr
        //   output main() in the module: ..... true
        //   has user-specified main(): ....... false
        //   has user-specified require()/import modules for main():
        //   .................................. false
        //   number of expected conflicts: .... 0
        //
        //
        // Parser Analysis flags:
        //
        //   no significant actions (parser is a language matcher only):
        //   .................................. false
        //   uses yyleng: ..................... false
        //   uses yylineno: ................... false
        //   uses yytext: ..................... false
        //   uses yylloc: ..................... false
        //   uses ParseError API: ............. false
        //   uses YYERROR: .................... false
        //   uses YYRECOVERING: ............... false
        //   uses YYERROK: .................... false
        //   uses YYCLEARIN: .................. false
        //   tracks rule values: .............. true
        //   assigns rule values: ............. true
        //   uses location tracking: .......... false
        //   assigns location: ................ false
        //   uses yystack: .................... false
        //   uses yysstack: ................... false
        //   uses yysp: ....................... true
        //   uses yyrulelength: ............... false
        //   uses yyMergeLocationInfo API: .... false
        //   has error recovery: .............. false
        //   has error reporting: ............. false
        //
        // --------- END OF REPORT -----------

    trace: function no_op_trace() { },
    JisonParserError: JisonParserError,
    yy: {},
    options: {
      type: "lalr",
      hasPartialLrUpgradeOnConflict: true,
      errorRecoveryTokenDiscardCount: 3
    },
    symbols_: {
      "$accept": 0,
      "$end": 1,
      "(": 4,
      ")": 5,
      "*": 6,
      "+": 8,
      "?": 7,
      "ALIAS": 9,
      "EOF": 1,
      "SYMBOL": 10,
      "error": 2,
      "expression": 16,
      "handle": 13,
      "handle_list": 12,
      "production": 11,
      "rule": 14,
      "suffix": 17,
      "suffixed_expression": 15,
      "|": 3
    },
    terminals_: {
      1: "EOF",
      2: "error",
      3: "|",
      4: "(",
      5: ")",
      6: "*",
      7: "?",
      8: "+",
      9: "ALIAS",
      10: "SYMBOL"
    },
    TERROR: 2,
        EOF: 1,

        // internals: defined here so the object *structure* doesn't get modified by parse() et al,
        // thus helping JIT compilers like Chrome V8.
        originalQuoteName: null,
        originalParseError: null,
        cleanupAfterParse: null,
        constructParseErrorInfo: null,
        yyMergeLocationInfo: null,
        copy_yytext: null,
        copy_yylloc: null,

        __reentrant_call_depth: 0,      // INTERNAL USE ONLY
        __error_infos: [],              // INTERNAL USE ONLY: the set of parseErrorInfo objects created since the last cleanup
        __error_recovery_infos: [],     // INTERNAL USE ONLY: the set of parseErrorInfo objects created since the last cleanup

        // APIs which will be set up depending on user action code analysis:
        //yyRecovering: 0,
        //yyErrOk: 0,
        //yyClearIn: 0,

        // Helper APIs
        // -----------

        // Helper function which can be overridden by user code later on: put suitable quotes around
        // literal IDs in a description string.
        quoteName: function parser_quoteName(id_str) {

            return '"' + id_str + '"';
        },

        // Return the name of the given symbol (terminal or non-terminal) as a string, when available.
        //
        // Return NULL when the symbol is unknown to the parser.
        getSymbolName: function parser_getSymbolName(symbol) {

            if (this.terminals_[symbol]) {
                return this.terminals_[symbol];
            }

            // Otherwise... this might refer to a RULE token i.e. a non-terminal: see if we can dig that one up.
            //
            // An example of this may be where a rule's action code contains a call like this:
            //
            //      parser.getSymbolName(#$)
            //
            // to obtain a human-readable name of the current grammar rule.
            var s = this.symbols_;
            for (var key in s) {
                if (s[key] === symbol) {
                    return key;
                }
            }
            return null;
        },

        // Return a more-or-less human-readable description of the given symbol, when available,
        // or the symbol itself, serving as its own 'description' for lack of something better to serve up.
        //
        // Return NULL when the symbol is unknown to the parser.
        describeSymbol: function parser_describeSymbol(symbol) {

            if (symbol !== this.EOF && this.terminal_descriptions_ && this.terminal_descriptions_[symbol]) {
                return this.terminal_descriptions_[symbol];
            }
            else if (symbol === this.EOF) {
                return 'end of input';
            }
            var id = this.getSymbolName(symbol);
            if (id) {
                return this.quoteName(id);
            }
            return null;
        },

        // Produce a (more or less) human-readable list of expected tokens at the point of failure.
        //
        // The produced list may contain token or token set descriptions instead of the tokens
        // themselves to help turning this output into something that easier to read by humans
        // unless `do_not_describe` parameter is set, in which case a list of the raw, *numeric*,
        // expected terminals and nonterminals is produced.
        //
        // The returned list (array) will not contain any duplicate entries.
        collect_expected_token_set: function parser_collect_expected_token_set(state, do_not_describe) {

            var TERROR = this.TERROR;
            var tokenset = [];
            var check = {};
            // Has this (error?) state been outfitted with a custom expectations description text for human consumption?
            // If so, use that one instead of the less palatable token set.
            if (!do_not_describe && this.state_descriptions_ && this.state_descriptions_[state]) {
                return [
                    this.state_descriptions_[state]
                ];
            }
            for (var p in this.table[state]) {
                p = +p;
                if (p !== TERROR) {
                    var d = do_not_describe ? p : this.describeSymbol(p);
                    if (d && !check[d]) {
                        tokenset.push(d);
                        check[d] = true;        // Mark this token description as already mentioned to prevent outputting duplicate entries.
                    }
                }
            }
            return tokenset;
        },
    productions_: bp({
      pop: u([
      11,
      12,
      12,
      13,
      13,
      14,
      14,
      15,
      15,
      16,
      16,
      s,
      [17, 4]
    ]),
      rule: u([
      2,
      1,
      3,
      0,
      1,
      1,
      2,
      3,
      c,
      [8, 6],
      1
    ])
    }),
    performAction: function parser__PerformAction(yystate /* action[1] */, yysp, yyvstack) {

              /* this == yyval */

              // the JS engine itself can go and remove these statements when `yy` turns out to be unused in any action code!
              var yy = this.yy;
              var yyparser = yy.parser;
              var yylexer = yy.lexer;

              

              switch (yystate) {
    case 0:
        /*! Production::    $accept : production $end */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,-,-,-,-):
        this.$ = yyvstack[yysp - 1];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,-,-,-,-)
        break;

    case 1:
        /*! Production::    production : handle EOF */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,-,-,-,-):
        this.$ = yyvstack[yysp - 1];
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,-,-,-,-)
        
        
        return yyvstack[yysp - 1];

    case 2:
        /*! Production::    handle_list : handle */
    case 6:
        /*! Production::    rule : suffixed_expression */

        this.$ = [yyvstack[yysp]];
        break;

    case 3:
        /*! Production::    handle_list : handle_list "|" handle */

        yyvstack[yysp - 2].push(yyvstack[yysp]);
        this.$ = yyvstack[yysp - 2];
        break;

    case 4:
        /*! Production::    handle : %epsilon */

        this.$ = [];
        break;

    case 5:
        /*! Production::    handle : rule */
    case 13:
        /*! Production::    suffix : "*" */
    case 14:
        /*! Production::    suffix : "?" */
    case 15:
        /*! Production::    suffix : "+" */

        this.$ = yyvstack[yysp];
        break;

    case 7:
        /*! Production::    rule : rule suffixed_expression */

        yyvstack[yysp - 1].push(yyvstack[yysp]);
        this.$ = yyvstack[yysp - 1];
        break;

    case 8:
        /*! Production::    suffixed_expression : expression suffix ALIAS */

        this.$ = ['xalias', yyvstack[yysp - 1], yyvstack[yysp - 2], yyvstack[yysp]];
        break;

    case 9:
        /*! Production::    suffixed_expression : expression suffix */

        if (yyvstack[yysp]) {
          this.$ = [yyvstack[yysp], yyvstack[yysp - 1]];
        } else {
          this.$ = yyvstack[yysp - 1];
        }
        break;

    case 10:
        /*! Production::    expression : SYMBOL */

        this.$ = ['symbol', yyvstack[yysp]];
        break;

    case 11:
        /*! Production::    expression : "(" handle_list ")" */

        this.$ = ['()', yyvstack[yysp - 1]];
        break;

    case 12:
        /*! Production::    suffix : %epsilon */

        this.$ = undefined;
        break;

    }
    },
    table: bt({
      len: u([
      8,
      1,
      1,
      7,
      0,
      10,
      0,
      9,
      0,
      0,
      6,
      s,
      [0, 3],
      2,
      s,
      [0, 3],
      8,
      0
    ]),
      symbol: u([
      1,
      4,
      10,
      11,
      s,
      [13, 4, 1],
      s,
      [1, 3],
      3,
      4,
      5,
      10,
      c,
      [9, 3],
      s,
      [3, 8, 1],
      17,
      c,
      [16, 4],
      s,
      [12, 5, 1],
      c,
      [19, 4],
      9,
      10,
      3,
      5,
      c,
      [17, 4],
      c,
      [16, 4]
    ]),
      type: u([
      s,
      [2, 3],
      s,
      [0, 5],
      1,
      s,
      [2, 6],
      0,
      0,
      s,
      [2, 9],
      c,
      [10, 5],
      s,
      [0, 5],
      s,
      [2, 12],
      s,
      [0, 4]
    ]),
      state: u([
      s,
      [1, 5, 1],
      9,
      5,
      10,
      14,
      15,
      c,
      [8, 3],
      19,
      c,
      [4, 3]
    ]),
      mode: u([
      2,
      s,
      [1, 3],
      2,
      2,
      1,
      2,
      c,
      [5, 3],
      c,
      [7, 3],
      c,
      [12, 4],
      c,
      [13, 9],
      c,
      [15, 3],
      c,
      [5, 4]
    ]),
      goto: u([
      4,
      7,
      6,
      8,
      5,
      5,
      7,
      5,
      6,
      s,
      [12, 4],
      11,
      12,
      13,
      12,
      12,
      4,
      7,
      4,
      6,
      s,
      [9, 4],
      16,
      9,
      18,
      17,
      c,
      [12, 4]
    ])
    }),
    defaultActions: {
      4: 6,
      6: 10,
      8: 1,
      9: 7,
      11: 13,
      12: 14,
      13: 15,
      15: 2,
      16: 8,
      17: 11,
      19: 3
    },
    parseError: function parseError(str, hash, ExceptionClass) {

        if (hash.recoverable) {
            if (typeof this.trace === 'function') {
                this.trace(str);
            }
            hash.destroy();             // destroy... well, *almost*!
        } else {
            if (typeof this.trace === 'function') {
                this.trace(str);
            }
            if (!ExceptionClass) {
                ExceptionClass = this.JisonParserError;
            }
            throw new ExceptionClass(str, hash);
        }
    },
    parse: function parse(input) {
        var self = this;
        var stack = new Array(128);         // token stack: stores token which leads to state at the same index (column storage)
        var sstack = new Array(128);        // state stack: stores states (column storage)

        var vstack = new Array(128);        // semantic value stack

        var table = this.table;
        var sp = 0;                         // 'stack pointer': index into the stacks


        


        var symbol = 0;



        var TERROR = this.TERROR;
        var EOF = this.EOF;
        var ERROR_RECOVERY_TOKEN_DISCARD_COUNT = (this.options.errorRecoveryTokenDiscardCount | 0) || 3;
        var NO_ACTION = [0, 20 /* === table.length :: ensures that anyone using this new state will fail dramatically! */];

        var lexer;
        if (this.__lexer__) {
            lexer = this.__lexer__;
        } else {
            lexer = this.__lexer__ = Object.create(this.lexer);
        }

        var sharedState_yy = {
            parseError: undefined,
            quoteName: undefined,
            lexer: undefined,
            parser: undefined,
            pre_parse: undefined,
            post_parse: undefined,
            pre_lex: undefined,
            post_lex: undefined      // WARNING: must be written this way for the code expanders to work correctly in both ES5 and ES6 modes!
        };

        var ASSERT;
        if (typeof assert !== 'function') {
            ASSERT = function JisonAssert(cond, msg) {
                if (!cond) {
                    throw new Error('assertion failed: ' + (msg || '***'));
                }
            };
        } else {
            ASSERT = assert;
        }

        this.yyGetSharedState = function yyGetSharedState() {
            return sharedState_yy;
        };








        function shallow_copy_noclobber(dst, src) {
            for (var k in src) {
                if (typeof dst[k] === 'undefined' && Object.prototype.hasOwnProperty.call(src, k)) {
                    dst[k] = src[k];
                }
            }
        }

        // copy state
        shallow_copy_noclobber(sharedState_yy, this.yy);

        sharedState_yy.lexer = lexer;
        sharedState_yy.parser = this;






        // Does the shared state override the default `parseError` that already comes with this instance?
        if (typeof sharedState_yy.parseError === 'function') {
            this.parseError = function parseErrorAlt(str, hash, ExceptionClass) {
                if (!ExceptionClass) {
                    ExceptionClass = this.JisonParserError;
                }
                return sharedState_yy.parseError.call(this, str, hash, ExceptionClass);
            };
        } else {
            this.parseError = this.originalParseError;
        }

        // Does the shared state override the default `quoteName` that already comes with this instance?
        if (typeof sharedState_yy.quoteName === 'function') {
            this.quoteName = function quoteNameAlt(id_str) {
                return sharedState_yy.quoteName.call(this, id_str);
            };
        } else {
            this.quoteName = this.originalQuoteName;
        }

        // set up the cleanup function; make it an API so that external code can re-use this one in case of
        // calamities or when the `%options no-try-catch` option has been specified for the grammar, in which
        // case this parse() API method doesn't come with a `finally { ... }` block any more!
        //
        // NOTE: as this API uses parse() as a closure, it MUST be set again on every parse() invocation,
        //       or else your `sharedState`, etc. references will be *wrong*!
        this.cleanupAfterParse = function parser_cleanupAfterParse(resultValue, invoke_post_methods, do_not_nuke_errorinfos) {
            var rv;

            if (invoke_post_methods) {
                var hash;

                if (sharedState_yy.post_parse || this.post_parse) {
                    // create an error hash info instance: we re-use this API in a **non-error situation**
                    // as this one delivers all parser internals ready for access by userland code.
                    hash = this.constructParseErrorInfo(null /* no error! */, null /* no exception! */, null, false);
                }

                if (sharedState_yy.post_parse) {
                    rv = sharedState_yy.post_parse.call(this, sharedState_yy, resultValue, hash);
                    if (typeof rv !== 'undefined') resultValue = rv;
                }
                if (this.post_parse) {
                    rv = this.post_parse.call(this, sharedState_yy, resultValue, hash);
                    if (typeof rv !== 'undefined') resultValue = rv;
                }

                // cleanup:
                if (hash && hash.destroy) {
                    hash.destroy();
                }
            }

            if (this.__reentrant_call_depth > 1) return resultValue;        // do not (yet) kill the sharedState when this is a reentrant run.

            // clean up the lingering lexer structures as well:
            if (lexer.cleanupAfterLex) {
                lexer.cleanupAfterLex(do_not_nuke_errorinfos);
            }

            // prevent lingering circular references from causing memory leaks:
            if (sharedState_yy) {
                sharedState_yy.lexer = undefined;
                sharedState_yy.parser = undefined;
                if (lexer.yy === sharedState_yy) {
                    lexer.yy = undefined;
                }
            }
            sharedState_yy = undefined;
            this.parseError = this.originalParseError;
            this.quoteName = this.originalQuoteName;

            // nuke the vstack[] array at least as that one will still reference obsoleted user values.
            // To be safe, we nuke the other internal stack columns as well...
            stack.length = 0;               // fastest way to nuke an array without overly bothering the GC
            sstack.length = 0;

            vstack.length = 0;
            sp = 0;

            // nuke the error hash info instances created during this run.
            // Userland code must COPY any data/references
            // in the error hash instance(s) it is more permanently interested in.
            if (!do_not_nuke_errorinfos) {
                for (var i = this.__error_infos.length - 1; i >= 0; i--) {
                    var el = this.__error_infos[i];
                    if (el && typeof el.destroy === 'function') {
                        el.destroy();
                    }
                }
                this.__error_infos.length = 0;


            }

            return resultValue;
        };






































































































































        // NOTE: as this API uses parse() as a closure, it MUST be set again on every parse() invocation,
        //       or else your `lexer`, `sharedState`, etc. references will be *wrong*!
        this.constructParseErrorInfo = function parser_constructParseErrorInfo(msg, ex, expected, recoverable) {
            var pei = {
                errStr: msg,
                exception: ex,
                text: lexer.match,
                value: lexer.yytext,
                token: this.describeSymbol(symbol) || symbol,
                token_id: symbol,
                line: lexer.yylineno,

                expected: expected,
                recoverable: recoverable,
                state: state,
                action: action,
                new_state: newState,
                symbol_stack: stack,
                state_stack: sstack,
                value_stack: vstack,

                stack_pointer: sp,
                yy: sharedState_yy,
                lexer: lexer,
                parser: this,

                // and make sure the error info doesn't stay due to potential
                // ref cycle via userland code manipulations.
                // These would otherwise all be memory leak opportunities!
                //
                // Note that only array and object references are nuked as those
                // constitute the set of elements which can produce a cyclic ref.
                // The rest of the members is kept intact as they are harmless.
                destroy: function destructParseErrorInfo() {
                    // remove cyclic references added to error info:
                    // info.yy = null;
                    // info.lexer = null;
                    // info.value = null;
                    // info.value_stack = null;
                    // ...
                    var rec = !!this.recoverable;
                    for (var key in this) {
                        if (this.hasOwnProperty(key) && typeof key === 'object') {
                            this[key] = undefined;
                        }
                    }
                    this.recoverable = rec;
                }
            };
            // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
            this.__error_infos.push(pei);
            return pei;
        };


        function stdLex() {
            var token = lexer.lex();
            // if token isn't its numeric value, convert
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }

            return token || EOF;
        }

        function fastLex() {
            var token = lexer.fastLex();
            // if token isn't its numeric value, convert
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }

            return token || EOF;
        }

        var lex = stdLex;


        var state, action, r, t;
        var yyval = {
            $: true,
            _$: undefined,
            yy: sharedState_yy
        };
        var p;
        var yyrulelen;
        var this_production;
        var newState;
        var retval = false;


        try {
            this.__reentrant_call_depth++;

            lexer.setInput(input, sharedState_yy);

            // NOTE: we *assume* no lexer pre/post handlers are set up *after* 
            // this initial `setInput()` call: hence we can now check and decide
            // whether we'll go with the standard, slower, lex() API or the
            // `fast_lex()` one:
            if (typeof lexer.canIUse === 'function') {
                var lexerInfo = lexer.canIUse();
                if (lexerInfo.fastLex && typeof fastLex === 'function') {
                    lex = fastLex;
                }
            } 



            vstack[sp] = null;
            sstack[sp] = 0;
            stack[sp] = 0;
            ++sp;





            if (this.pre_parse) {
                this.pre_parse.call(this, sharedState_yy);
            }
            if (sharedState_yy.pre_parse) {
                sharedState_yy.pre_parse.call(this, sharedState_yy);
            }

            newState = sstack[sp - 1];
            for (;;) {
                // retrieve state number from top of stack
                state = newState;               // sstack[sp - 1];

                // use default actions if available
                if (this.defaultActions[state]) {
                    action = 2;
                    newState = this.defaultActions[state];
                } else {
                    // The single `==` condition below covers both these `===` comparisons in a single
                    // operation:
                    //
                    //     if (symbol === null || typeof symbol === 'undefined') ...
                    if (!symbol) {
                        symbol = lex();
                    }
                    // read action for current state and first input
                    t = (table[state] && table[state][symbol]) || NO_ACTION;
                    newState = t[1];
                    action = t[0];











                    // handle parse error
                    if (!action) {
                        var errStr;
                        var errSymbolDescr = (this.describeSymbol(symbol) || symbol);
                        var expected = this.collect_expected_token_set(state);

                        // Report error
                        if (typeof lexer.yylineno === 'number') {
                            errStr = 'Parse error on line ' + (lexer.yylineno + 1) + ': ';
                        } else {
                            errStr = 'Parse error: ';
                        }
                        if (typeof lexer.showPosition === 'function') {
                            errStr += '\n' + lexer.showPosition(79 - 10, 10) + '\n';
                        }
                        if (expected.length) {
                            errStr += 'Expecting ' + expected.join(', ') + ', got unexpected ' + errSymbolDescr;
                        } else {
                            errStr += 'Unexpected ' + errSymbolDescr;
                        }
                        // we cannot recover from the error!
                        p = this.constructParseErrorInfo(errStr, null, expected, false);
                        r = this.parseError(p.errStr, p, this.JisonParserError);
                        if (typeof r !== 'undefined') {
                            retval = r;
                        }
                        break;
                    }


                }










                switch (action) {
                // catch misc. parse failures:
                default:
                    // this shouldn't happen, unless resolve defaults are off
                    if (action instanceof Array) {
                        p = this.constructParseErrorInfo('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol, null, null, false);
                        r = this.parseError(p.errStr, p, this.JisonParserError);
                        if (typeof r !== 'undefined') {
                            retval = r;
                        }
                        break;
                    }
                    // Another case of better safe than sorry: in case state transitions come out of another error recovery process
                    // or a buggy LUT (LookUp Table):
                    p = this.constructParseErrorInfo('Parsing halted. No viable error recovery approach available due to internal system failure.', null, null, false);
                    r = this.parseError(p.errStr, p, this.JisonParserError);
                    if (typeof r !== 'undefined') {
                        retval = r;
                    }
                    break;

                // shift:
                case 1:
                    stack[sp] = symbol;
                    vstack[sp] = lexer.yytext;

                    sstack[sp] = newState; // push state

                    ++sp;
                    symbol = 0;




                    // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:




                    continue;

                // reduce:
                case 2:



                    this_production = this.productions_[newState - 1];  // `this.productions_[]` is zero-based indexed while states start from 1 upwards...
                    yyrulelen = this_production[1];










                    r = this.performAction.call(yyval, newState, sp - 1, vstack);

                    if (typeof r !== 'undefined') {
                        retval = r;
                        break;
                    }

                    // pop off stack
                    sp -= yyrulelen;

                    // don't overwrite the `symbol` variable: use a local var to speed things up:
                    var ntsymbol = this_production[0];    // push nonterminal (reduce)
                    stack[sp] = ntsymbol;
                    vstack[sp] = yyval.$;

                    // goto new state = table[STATE][NONTERMINAL]
                    newState = table[sstack[sp - 1]][ntsymbol];
                    sstack[sp] = newState;
                    ++sp;









                    continue;

                // accept:
                case 3:
                    if (sp !== -2) {
                        retval = true;
                        // Return the `$accept` rule's `$$` result, if available.
                        //
                        // Also note that JISON always adds this top-most `$accept` rule (with implicit,
                        // default, action):
                        //
                        //     $accept: <startSymbol> $end
                        //                  %{ $$ = $1; @$ = @1; %}
                        //
                        // which, combined with the parse kernel's `$accept` state behaviour coded below,
                        // will produce the `$$` value output of the <startSymbol> rule as the parse result,
                        // IFF that result is *not* `undefined`. (See also the parser kernel code.)
                        //
                        // In code:
                        //
                        //                  %{
                        //                      @$ = @1;            // if location tracking support is included
                        //                      if (typeof $1 !== 'undefined')
                        //                          return $1;
                        //                      else
                        //                          return true;           // the default parse result if the rule actions don't produce anything
                        //                  %}
                        sp--;
                        if (typeof vstack[sp] !== 'undefined') {
                            retval = vstack[sp];
                        }
                    }
                    break;
                }

                // break out of loop: we accept or fail with error
                break;
            }
        } catch (ex) {
            // report exceptions through the parseError callback too, but keep the exception intact
            // if it is a known parser or lexer error which has been thrown by parseError() already:
            if (ex instanceof this.JisonParserError) {
                throw ex;
            }
            else if (lexer && typeof lexer.JisonLexerError === 'function' && ex instanceof lexer.JisonLexerError) {
                throw ex;
            }

            p = this.constructParseErrorInfo('Parsing aborted due to exception.', ex, null, false);
            retval = false;
            r = this.parseError(p.errStr, p, this.JisonParserError);
            if (typeof r !== 'undefined') {
                retval = r;
            }
        } finally {
            retval = this.cleanupAfterParse(retval, true, true);
            this.__reentrant_call_depth--;
        }   // /finally

        return retval;
    }
    };
    parser.originalParseError = parser.parseError;
    parser.originalQuoteName = parser.quoteName;
    /* lexer generated by jison-lex 0.6.2-220 */

    /*
     * Returns a Lexer object of the following structure:
     *
     *  Lexer: {
     *    yy: {}     The so-called "shared state" or rather the *source* of it;
     *               the real "shared state" `yy` passed around to
     *               the rule actions, etc. is a direct reference!
     *
     *               This "shared context" object was passed to the lexer by way of 
     *               the `lexer.setInput(str, yy)` API before you may use it.
     *
     *               This "shared context" object is passed to the lexer action code in `performAction()`
     *               so userland code in the lexer actions may communicate with the outside world 
     *               and/or other lexer rules' actions in more or less complex ways.
     *
     *  }
     *
     *  Lexer.prototype: {
     *    EOF: 1,
     *    ERROR: 2,
     *
     *    yy:        The overall "shared context" object reference.
     *
     *    JisonLexerError: function(msg, hash),
     *
     *    performAction: function lexer__performAction(yy, yyrulenumber, YY_START),
     *
     *               The function parameters and `this` have the following value/meaning:
     *               - `this`    : reference to the `lexer` instance. 
     *                               `yy_` is an alias for `this` lexer instance reference used internally.
     *
     *               - `yy`      : a reference to the `yy` "shared state" object which was passed to the lexer
     *                             by way of the `lexer.setInput(str, yy)` API before.
     *
     *                             Note:
     *                             The extra arguments you specified in the `%parse-param` statement in your
     *                             **parser** grammar definition file are passed to the lexer via this object
     *                             reference as member variables.
     *
     *               - `yyrulenumber`   : index of the matched lexer rule (regex), used internally.
     *
     *               - `YY_START`: the current lexer "start condition" state.
     *
     *    parseError: function(str, hash, ExceptionClass),
     *
     *    constructLexErrorInfo: function(error_message, is_recoverable),
     *               Helper function.
     *               Produces a new errorInfo 'hash object' which can be passed into `parseError()`.
     *               See it's use in this lexer kernel in many places; example usage:
     *
     *                   var infoObj = lexer.constructParseErrorInfo('fail!', true);
     *                   var retVal = lexer.parseError(infoObj.errStr, infoObj, lexer.JisonLexerError);
     *
     *    options: { ... lexer %options ... },
     *
     *    lex: function(),
     *               Produce one token of lexed input, which was passed in earlier via the `lexer.setInput()` API.
     *               You MAY use the additional `args...` parameters as per `%parse-param` spec of the **lexer** grammar:
     *               these extra `args...` are added verbatim to the `yy` object reference as member variables.
     *
     *               WARNING:
     *               Lexer's additional `args...` parameters (via lexer's `%parse-param`) MAY conflict with
     *               any attributes already added to `yy` by the **parser** or the jison run-time; 
     *               when such a collision is detected an exception is thrown to prevent the generated run-time 
     *               from silently accepting this confusing and potentially hazardous situation! 
     *
     *    cleanupAfterLex: function(do_not_nuke_errorinfos),
     *               Helper function.
     *
     *               This helper API is invoked when the **parse process** has completed: it is the responsibility
     *               of the **parser** (or the calling userland code) to invoke this method once cleanup is desired. 
     *
     *               This helper may be invoked by user code to ensure the internal lexer gets properly garbage collected.
     *
     *    setInput: function(input, [yy]),
     *
     *
     *    input: function(),
     *
     *
     *    unput: function(str),
     *
     *
     *    more: function(),
     *
     *
     *    reject: function(),
     *
     *
     *    less: function(n),
     *
     *
     *    pastInput: function(n),
     *
     *
     *    upcomingInput: function(n),
     *
     *
     *    showPosition: function(),
     *
     *
     *    test_match: function(regex_match_array, rule_index),
     *
     *
     *    next: function(),
     *
     *
     *    begin: function(condition),
     *
     *
     *    pushState: function(condition),
     *
     *
     *    popState: function(),
     *
     *
     *    topState: function(),
     *
     *
     *    _currentRules: function(),
     *
     *
     *    stateStackSize: function(),
     *
     *
     *    performAction: function(yy, yy_, yyrulenumber, YY_START),
     *
     *
     *    rules: [...],
     *
     *
     *    conditions: {associative list: name ==> set},
     *  }
     *
     *
     *  token location info (`yylloc`): {
     *    first_line: n,
     *    last_line: n,
     *    first_column: n,
     *    last_column: n,
     *    range: [start_number, end_number]
     *               (where the numbers are indexes into the input string, zero-based)
     *  }
     *
     * ---
     *
     * The `parseError` function receives a 'hash' object with these members for lexer errors:
     *
     *  {
     *    text:        (matched text)
     *    token:       (the produced terminal token, if any)
     *    token_id:    (the produced terminal token numeric ID, if any)
     *    line:        (yylineno)
     *    loc:         (yylloc)
     *    recoverable: (boolean: TRUE when the parser MAY have an error recovery rule
     *                  available for this particular error)
     *    yy:          (object: the current parser internal "shared state" `yy`
     *                  as is also available in the rule actions; this can be used,
     *                  for instance, for advanced error analysis and reporting)
     *    lexer:       (reference to the current lexer instance used by the parser)
     *  }
     *
     * while `this` will reference the current lexer instance.
     *
     * When `parseError` is invoked by the lexer, the default implementation will
     * attempt to invoke `yy.parser.parseError()`; when this callback is not provided
     * it will try to invoke `yy.parseError()` instead. When that callback is also not
     * provided, a `JisonLexerError` exception will be thrown containing the error
     * message and `hash`, as constructed by the `constructLexErrorInfo()` API.
     *
     * Note that the lexer's `JisonLexerError` error class is passed via the
     * `ExceptionClass` argument, which is invoked to construct the exception
     * instance to be thrown, so technically `parseError` will throw the object
     * produced by the `new ExceptionClass(str, hash)` JavaScript expression.
     *
     * ---
     *
     * You can specify lexer options by setting / modifying the `.options` object of your Lexer instance.
     * These options are available:
     *
     * (Options are permanent.)
     *  
     *  yy: {
     *      parseError: function(str, hash, ExceptionClass)
     *                 optional: overrides the default `parseError` function.
     *  }
     *
     *  lexer.options: {
     *      pre_lex:  function()
     *                 optional: is invoked before the lexer is invoked to produce another token.
     *                 `this` refers to the Lexer object.
     *      post_lex: function(token) { return token; }
     *                 optional: is invoked when the lexer has produced a token `token`;
     *                 this function can override the returned token value by returning another.
     *                 When it does not return any (truthy) value, the lexer will return
     *                 the original `token`.
     *                 `this` refers to the Lexer object.
     *
     * WARNING: the next set of options are not meant to be changed. They echo the abilities of
     * the lexer as per when it was compiled!
     *
     *      ranges: boolean
     *                 optional: `true` ==> token location info will include a .range[] member.
     *      flex: boolean
     *                 optional: `true` ==> flex-like lexing behaviour where the rules are tested
     *                 exhaustively to find the longest match.
     *      backtrack_lexer: boolean
     *                 optional: `true` ==> lexer regexes are tested in order and for invoked;
     *                 the lexer terminates the scan when a token is returned by the action code.
     *      xregexp: boolean
     *                 optional: `true` ==> lexer rule regexes are "extended regex format" requiring the
     *                 `XRegExp` library. When this %option has not been specified at compile time, all lexer
     *                 rule regexes have been written as standard JavaScript RegExp expressions.
     *  }
     */


    var lexer = function() {
      /**
       * See also:
       * http://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/#35881508
       * but we keep the prototype.constructor and prototype.name assignment lines too for compatibility
       * with userland code which might access the derived class in a 'classic' way.
       *
       * @public
       * @constructor
       * @nocollapse
       */
      function JisonLexerError(msg, hash) {

        Object.defineProperty(this, 'name', {
          enumerable: false,
          writable: false,
          value: 'JisonLexerError'
        });

        if (msg == null)
          msg = '???';

        Object.defineProperty(this, 'message', {
          enumerable: false,
          writable: true,
          value: msg
        });

        this.hash = hash;
        var stacktrace;

        if (hash && hash.exception instanceof Error) {
          var ex2 = hash.exception;
          this.message = ex2.message || msg;
          stacktrace = ex2.stack;
        }

        if (!stacktrace) {
          if (Error.hasOwnProperty('captureStackTrace')) {
            // V8
            Error.captureStackTrace(this, this.constructor);
          } else {
            stacktrace = new Error(msg).stack;
          }
        }

        if (stacktrace) {
          Object.defineProperty(this, 'stack', {
            enumerable: false,
            writable: false,
            value: stacktrace
          });
        }
      }

      if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(JisonLexerError.prototype, Error.prototype);
      } else {
        JisonLexerError.prototype = Object.create(Error.prototype);
      }

      JisonLexerError.prototype.constructor = JisonLexerError;
      JisonLexerError.prototype.name = 'JisonLexerError';

      var lexer = {
        
    // Code Generator Information Report
    // ---------------------------------
    //
    // Options:
    //
    //   backtracking: .................... false
    //   location.ranges: ................. true
    //   location line+column tracking: ... true
    //
    //
    // Forwarded Parser Analysis flags:
    //
    //   uses yyleng: ..................... false
    //   uses yylineno: ................... false
    //   uses yytext: ..................... false
    //   uses yylloc: ..................... false
    //   uses lexer values: ............... true / true
    //   location tracking: ............... false
    //   location assignment: ............. false
    //
    //
    // Lexer Analysis flags:
    //
    //   uses yyleng: ..................... ???
    //   uses yylineno: ................... ???
    //   uses yytext: ..................... ???
    //   uses yylloc: ..................... ???
    //   uses ParseError API: ............. ???
    //   uses yyerror: .................... ???
    //   uses location tracking & editing:  ???
    //   uses more() API: ................. ???
    //   uses unput() API: ................ ???
    //   uses reject() API: ............... ???
    //   uses less() API: ................. ???
    //   uses display APIs pastInput(), upcomingInput(), showPosition():
    //        ............................. ???
    //   uses describeYYLLOC() API: ....... ???
    //
    // --------- END OF REPORT -----------

    EOF: 1,
        ERROR: 2,

        // JisonLexerError: JisonLexerError,        /// <-- injected by the code generator

        // options: {},                             /// <-- injected by the code generator

        // yy: ...,                                 /// <-- injected by setInput()

        /// INTERNAL USE ONLY: internal rule set cache for the current lexer state
        __currentRuleSet__: null,

        /// INTERNAL USE ONLY: the set of lexErrorInfo objects created since the last cleanup
        __error_infos: [],

        /// INTERNAL USE ONLY: mark whether the lexer instance has been 'unfolded' completely and is now ready for use
        __decompressed: false,

        /// INTERNAL USE ONLY
        done: false,

        /// INTERNAL USE ONLY
        _backtrack: false,

        /// INTERNAL USE ONLY
        _input: '',

        /// INTERNAL USE ONLY
        _more: false,

        /// INTERNAL USE ONLY
        _signaled_error_token: false,

        /// INTERNAL USE ONLY; managed via `pushState()`, `popState()`, `topState()` and `stateStackSize()`
        conditionStack: [],

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction. `match` is identical to `yytext` except that this one still contains the matched input string after `lexer.performAction()` has been invoked, where userland code MAY have changed/replaced the `yytext` value entirely!
        match: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks entire input which has been matched so far
        matched: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks RE match result for last (successful) match attempt
        matches: false,

        /// ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction; this value is transferred to the parser as the 'token value' when the parser consumes the lexer token produced through a call to the `lex()` API.
        yytext: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks the 'cursor position' in the input string, i.e. the number of characters matched so far
        offset: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: length of matched input for the token under construction (`yytext`)
        yyleng: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: 'line number' at which the token under construction is located
        yylineno: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks location info (lines + columns) for the token under construction
        yylloc: null,

        /**
             * INTERNAL USE: construct a suitable error info hash object instance for `parseError`.
             * 
             * @public
             * @this {RegExpLexer}
             */
        constructLexErrorInfo: function lexer_constructLexErrorInfo(msg, recoverable, show_input_position) {
          msg = '' + msg;

          // heuristic to determine if the error message already contains a (partial) source code dump
          // as produced by either `showPosition()` or `prettyPrintRange()`:
          if (show_input_position == undefined) {
            show_input_position = !(msg.indexOf('\n') > 0 && msg.indexOf('^') > 0);
          }

          if (this.yylloc && show_input_position) {
            if (typeof this.prettyPrintRange === 'function') {
              var pretty_src = this.prettyPrintRange(this.yylloc);

              if (!/\n\s*$/.test(msg)) {
                msg += '\n';
              }

              msg += '\n  Erroneous area:\n' + this.prettyPrintRange(this.yylloc);
            } else if (typeof this.showPosition === 'function') {
              var pos_str = this.showPosition();

              if (pos_str) {
                if (msg.length && msg[msg.length - 1] !== '\n' && pos_str[0] !== '\n') {
                  msg += '\n' + pos_str;
                } else {
                  msg += pos_str;
                }
              }
            }
          }

          /** @constructor */
          var pei = {
            errStr: msg,
            recoverable: !!recoverable,

            // This one MAY be empty; userland code should use the `upcomingInput` API to obtain more text which follows the 'lexer cursor position'...
            text: this.match,

            token: null,
            line: this.yylineno,
            loc: this.yylloc,
            yy: this.yy,
            lexer: this,

            /**
                         * and make sure the error info doesn't stay due to potential
                         * ref cycle via userland code manipulations.
                         * These would otherwise all be memory leak opportunities!
                         * 
                         * Note that only array and object references are nuked as those
                         * constitute the set of elements which can produce a cyclic ref.
                         * The rest of the members is kept intact as they are harmless.
                         * 
                         * @public
                         * @this {LexErrorInfo}
                         */
            destroy: function destructLexErrorInfo() {
              // remove cyclic references added to error info:
              // info.yy = null;
              // info.lexer = null;
              // ...
              var rec = !!this.recoverable;

              for (var key in this) {
                if (this.hasOwnProperty(key) && typeof key === 'object') {
                  this[key] = undefined;
                }
              }

              this.recoverable = rec;
            }
          };

          // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
          this.__error_infos.push(pei);

          return pei;
        },

        /**
             * handler which is invoked when a lexer error occurs.
             * 
             * @public
             * @this {RegExpLexer}
             */
        parseError: function lexer_parseError(str, hash, ExceptionClass) {
          if (!ExceptionClass) {
            ExceptionClass = this.JisonLexerError;
          }

          if (this.yy) {
            if (this.yy.parser && typeof this.yy.parser.parseError === 'function') {
              return this.yy.parser.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            } else if (typeof this.yy.parseError === 'function') {
              return this.yy.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            }
          }

          throw new ExceptionClass(str, hash);
        },

        /**
             * method which implements `yyerror(str, ...args)` functionality for use inside lexer actions.
             * 
             * @public
             * @this {RegExpLexer}
             */
        yyerror: function yyError(str /*, ...args */) {
          var lineno_msg = '';

          if (this.yylloc) {
            lineno_msg = ' on line ' + (this.yylineno + 1);
          }

          var p = this.constructLexErrorInfo(
            'Lexical error' + lineno_msg + ': ' + str,
            this.options.lexerErrorsAreRecoverable
          );

          // Add any extra args to the hash under the name `extra_error_attributes`:
          var args = Array.prototype.slice.call(arguments, 1);

          if (args.length) {
            p.extra_error_attributes = args;
          }

          return this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
        },

        /**
             * final cleanup function for when we have completed lexing the input;
             * make it an API so that external code can use this one once userland
             * code has decided it's time to destroy any lingering lexer error
             * hash object instances and the like: this function helps to clean
             * up these constructs, which *may* carry cyclic references which would
             * otherwise prevent the instances from being properly and timely
             * garbage-collected, i.e. this function helps prevent memory leaks!
             * 
             * @public
             * @this {RegExpLexer}
             */
        cleanupAfterLex: function lexer_cleanupAfterLex(do_not_nuke_errorinfos) {
          // prevent lingering circular references from causing memory leaks:
          this.setInput('', {});

          // nuke the error hash info instances created during this run.
          // Userland code must COPY any data/references
          // in the error hash instance(s) it is more permanently interested in.
          if (!do_not_nuke_errorinfos) {
            for (var i = this.__error_infos.length - 1; i >= 0; i--) {
              var el = this.__error_infos[i];

              if (el && typeof el.destroy === 'function') {
                el.destroy();
              }
            }

            this.__error_infos.length = 0;
          }

          return this;
        },

        /**
             * clear the lexer token context; intended for internal use only
             * 
             * @public
             * @this {RegExpLexer}
             */
        clear: function lexer_clear() {
          this.yytext = '';
          this.yyleng = 0;
          this.match = '';

          // - DO NOT reset `this.matched`
          this.matches = false;

          this._more = false;
          this._backtrack = false;
          var col = this.yylloc ? this.yylloc.last_column : 0;

          this.yylloc = {
            first_line: this.yylineno + 1,
            first_column: col,
            last_line: this.yylineno + 1,
            last_column: col,
            range: [this.offset, this.offset]
          };
        },

        /**
             * resets the lexer, sets new input
             * 
             * @public
             * @this {RegExpLexer}
             */
        setInput: function lexer_setInput(input, yy) {
          this.yy = yy || this.yy || {};

          // also check if we've fully initialized the lexer instance,
          // including expansion work to be done to go from a loaded
          // lexer to a usable lexer:
          if (!this.__decompressed) {
            // step 1: decompress the regex list:
            var rules = this.rules;

            for (var i = 0, len = rules.length; i < len; i++) {
              var rule_re = rules[i];

              // compression: is the RE an xref to another RE slot in the rules[] table?
              if (typeof rule_re === 'number') {
                rules[i] = rules[rule_re];
              }
            }

            // step 2: unfold the conditions[] set to make these ready for use:
            var conditions = this.conditions;

            for (var k in conditions) {
              var spec = conditions[k];
              var rule_ids = spec.rules;
              var len = rule_ids.length;
              var rule_regexes = new Array(len + 1);            // slot 0 is unused; we use a 1-based index approach here to keep the hottest code in `lexer_next()` fast and simple!
              var rule_new_ids = new Array(len + 1);

              for (var i = 0; i < len; i++) {
                var idx = rule_ids[i];
                var rule_re = rules[idx];
                rule_regexes[i + 1] = rule_re;
                rule_new_ids[i + 1] = idx;
              }

              spec.rules = rule_new_ids;
              spec.__rule_regexes = rule_regexes;
              spec.__rule_count = len;
            }

            this.__decompressed = true;
          }

          this._input = input || '';
          this.clear();
          this._signaled_error_token = false;
          this.done = false;
          this.yylineno = 0;
          this.matched = '';
          this.conditionStack = ['INITIAL'];
          this.__currentRuleSet__ = null;

          this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
            range: [0, 0]
          };

          this.offset = 0;
          return this;
        },

        /**
             * edit the remaining input via user-specified callback.
             * This can be used to forward-adjust the input-to-parse, 
             * e.g. inserting macro expansions and alike in the
             * input which has yet to be lexed.
             * The behaviour of this API contrasts the `unput()` et al
             * APIs as those act on the *consumed* input, while this
             * one allows one to manipulate the future, without impacting
             * the current `yyloc` cursor location or any history. 
             * 
             * Use this API to help implement C-preprocessor-like
             * `#include` statements, etc.
             * 
             * The provided callback must be synchronous and is
             * expected to return the edited input (string).
             *
             * The `cpsArg` argument value is passed to the callback
             * as-is.
             *
             * `callback` interface: 
             * `function callback(input, cpsArg)`
             * 
             * - `input` will carry the remaining-input-to-lex string
             *   from the lexer.
             * - `cpsArg` is `cpsArg` passed into this API.
             * 
             * The `this` reference for the callback will be set to
             * reference this lexer instance so that userland code
             * in the callback can easily and quickly access any lexer
             * API. 
             *
             * When the callback returns a non-string-type falsey value,
             * we assume the callback did not edit the input and we
             * will using the input as-is.
             *
             * When the callback returns a non-string-type value, it
             * is converted to a string for lexing via the `"" + retval`
             * operation. (See also why: http://2ality.com/2012/03/converting-to-string.html 
             * -- that way any returned object's `toValue()` and `toString()`
             * methods will be invoked in a proper/desirable order.)
             * 
             * @public
             * @this {RegExpLexer}
             */
        editRemainingInput: function lexer_editRemainingInput(callback, cpsArg) {
          var rv = callback.call(this, this._input, cpsArg);

          if (typeof rv !== 'string') {
            if (rv) {
              this._input = '' + rv;
            }
            // else: keep `this._input` as is. 
          } else {
            this._input = rv;
          }

          return this;
        },

        /**
             * consumes and returns one char from the input
             * 
             * @public
             * @this {RegExpLexer}
             */
        input: function lexer_input() {
          if (!this._input) {
            //this.done = true;    -- don't set `done` as we want the lex()/next() API to be able to produce one custom EOF token match after this anyhow. (lexer can match special <<EOF>> tokens and perform user action code for a <<EOF>> match, but only does so *once*)
            return null;
          }

          var ch = this._input[0];
          this.yytext += ch;
          this.yyleng++;
          this.offset++;
          this.match += ch;
          this.matched += ch;

          // Count the linenumber up when we hit the LF (or a stand-alone CR).
          // On CRLF, the linenumber is incremented when you fetch the CR or the CRLF combo
          // and we advance immediately past the LF as well, returning both together as if
          // it was all a single 'character' only.
          var slice_len = 1;

          var lines = false;

          if (ch === '\n') {
            lines = true;
          } else if (ch === '\r') {
            lines = true;
            var ch2 = this._input[1];

            if (ch2 === '\n') {
              slice_len++;
              ch += ch2;
              this.yytext += ch2;
              this.yyleng++;
              this.offset++;
              this.match += ch2;
              this.matched += ch2;
              this.yylloc.range[1]++;
            }
          }

          if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
            this.yylloc.last_column = 0;
          } else {
            this.yylloc.last_column++;
          }

          this.yylloc.range[1]++;
          this._input = this._input.slice(slice_len);
          return ch;
        },

        /**
             * unshifts one char (or an entire string) into the input
             * 
             * @public
             * @this {RegExpLexer}
             */
        unput: function lexer_unput(ch) {
          var len = ch.length;
          var lines = ch.split(/(?:\r\n?|\n)/g);
          this._input = ch + this._input;
          this.yytext = this.yytext.substr(0, this.yytext.length - len);
          this.yyleng = this.yytext.length;
          this.offset -= len;
          this.match = this.match.substr(0, this.match.length - len);
          this.matched = this.matched.substr(0, this.matched.length - len);

          if (lines.length > 1) {
            this.yylineno -= lines.length - 1;
            this.yylloc.last_line = this.yylineno + 1;

            // Get last entirely matched line into the `pre_lines[]` array's
            // last index slot; we don't mind when other previously 
            // matched lines end up in the array too. 
            var pre = this.match;

            var pre_lines = pre.split(/(?:\r\n?|\n)/g);

            if (pre_lines.length === 1) {
              pre = this.matched;
              pre_lines = pre.split(/(?:\r\n?|\n)/g);
            }

            this.yylloc.last_column = pre_lines[pre_lines.length - 1].length;
          } else {
            this.yylloc.last_column -= len;
          }

          this.yylloc.range[1] = this.yylloc.range[0] + this.yyleng;
          this.done = false;
          return this;
        },

        /**
             * cache matched text and append it on next action
             * 
             * @public
             * @this {RegExpLexer}
             */
        more: function lexer_more() {
          this._more = true;
          return this;
        },

        /**
             * signal the lexer that this rule fails to match the input, so the
             * next matching rule (regex) should be tested instead.
             * 
             * @public
             * @this {RegExpLexer}
             */
        reject: function lexer_reject() {
          if (this.options.backtrack_lexer) {
            this._backtrack = true;
          } else {
            // when the `parseError()` call returns, we MUST ensure that the error is registered.
            // We accomplish this by signaling an 'error' token to be produced for the current
            // `.lex()` run.
            var lineno_msg = '';

            if (this.yylloc) {
              lineno_msg = ' on line ' + (this.yylineno + 1);
            }

            var p = this.constructLexErrorInfo(
              'Lexical error' + lineno_msg + ': You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).',
              false
            );

            this._signaled_error_token = this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
          }

          return this;
        },

        /**
             * retain first n characters of the match
             * 
             * @public
             * @this {RegExpLexer}
             */
        less: function lexer_less(n) {
          return this.unput(this.match.slice(n));
        },

        /**
             * return (part of the) already matched input, i.e. for error
             * messages.
             * 
             * Limit the returned string length to `maxSize` (default: 20).
             * 
             * Limit the returned string to the `maxLines` number of lines of
             * input (default: 1).
             * 
             * Negative limit values equal *unlimited*.
             * 
             * @public
             * @this {RegExpLexer}
             */
        pastInput: function lexer_pastInput(maxSize, maxLines) {
          var past = this.matched.substring(0, this.matched.length - this.match.length);

          if (maxSize < 0)
            maxSize = past.length;
          else if (!maxSize)
            maxSize = 20;

          if (maxLines < 0)
            maxLines = past.length;         // can't ever have more input lines than this!;
          else if (!maxLines)
            maxLines = 1;

          // `substr` anticipation: treat \r\n as a single character and take a little
          // more than necessary so that we can still properly check against maxSize
          // after we've transformed and limited the newLines in here:
          past = past.substr(-maxSize * 2 - 2);

          // now that we have a significantly reduced string to process, transform the newlines
          // and chop them, then limit them:
          var a = past.replace(/\r\n|\r/g, '\n').split('\n');

          a = a.slice(-maxLines);
          past = a.join('\n');

          // When, after limiting to maxLines, we still have too much to return,
          // do add an ellipsis prefix...
          if (past.length > maxSize) {
            past = '...' + past.substr(-maxSize);
          }

          return past;
        },

        /**
             * return (part of the) upcoming input, i.e. for error messages.
             * 
             * Limit the returned string length to `maxSize` (default: 20).
             * 
             * Limit the returned string to the `maxLines` number of lines of input (default: 1).
             * 
             * Negative limit values equal *unlimited*.
             *
             * > ### NOTE ###
             * >
             * > *"upcoming input"* is defined as the whole of the both
             * > the *currently lexed* input, together with any remaining input
             * > following that. *"currently lexed"* input is the input 
             * > already recognized by the lexer but not yet returned with
             * > the lexer token. This happens when you are invoking this API
             * > from inside any lexer rule action code block. 
             * >
             * 
             * @public
             * @this {RegExpLexer}
             */
        upcomingInput: function lexer_upcomingInput(maxSize, maxLines) {
          var next = this.match;

          if (maxSize < 0)
            maxSize = next.length + this._input.length;
          else if (!maxSize)
            maxSize = 20;

          if (maxLines < 0)
            maxLines = maxSize;         // can't ever have more input lines than this!;
          else if (!maxLines)
            maxLines = 1;

          // `substring` anticipation: treat \r\n as a single character and take a little
          // more than necessary so that we can still properly check against maxSize
          // after we've transformed and limited the newLines in here:
          if (next.length < maxSize * 2 + 2) {
            next += this._input.substring(0, maxSize * 2 + 2);  // substring is faster on Chrome/V8
          }

          // now that we have a significantly reduced string to process, transform the newlines
          // and chop them, then limit them:
          var a = next.replace(/\r\n|\r/g, '\n').split('\n');

          a = a.slice(0, maxLines);
          next = a.join('\n');

          // When, after limiting to maxLines, we still have too much to return,
          // do add an ellipsis postfix...
          if (next.length > maxSize) {
            next = next.substring(0, maxSize) + '...';
          }

          return next;
        },

        /**
             * return a string which displays the character position where the
             * lexing error occurred, i.e. for error messages
             * 
             * @public
             * @this {RegExpLexer}
             */
        showPosition: function lexer_showPosition(maxPrefix, maxPostfix) {
          var pre = this.pastInput(maxPrefix).replace(/\s/g, ' ');
          var c = new Array(pre.length + 1).join('-');
          return pre + this.upcomingInput(maxPostfix).replace(/\s/g, ' ') + '\n' + c + '^';
        },

        /**
             * return an YYLLOC info object derived off the given context (actual, preceding, following, current).
             * Use this method when the given `actual` location is not guaranteed to exist (i.e. when
             * it MAY be NULL) and you MUST have a valid location info object anyway:
             * then we take the given context of the `preceding` and `following` locations, IFF those are available,
             * and reconstruct the `actual` location info from those.
             * If this fails, the heuristic is to take the `current` location, IFF available.
             * If this fails as well, we assume the sought location is at/around the current lexer position
             * and then produce that one as a response. DO NOTE that these heuristic/derived location info
             * values MAY be inaccurate!
             *
             * NOTE: `deriveLocationInfo()` ALWAYS produces a location info object *copy* of `actual`, not just
             * a *reference* hence all input location objects can be assumed to be 'constant' (function has no side-effects).
             * 
             * @public
             * @this {RegExpLexer}
             */
        deriveLocationInfo: function lexer_deriveYYLLOC(actual, preceding, following, current) {
          var loc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
            range: [0, 0]
          };

          if (actual) {
            loc.first_line = actual.first_line | 0;
            loc.last_line = actual.last_line | 0;
            loc.first_column = actual.first_column | 0;
            loc.last_column = actual.last_column | 0;

            if (actual.range) {
              loc.range[0] = actual.range[0] | 0;
              loc.range[1] = actual.range[1] | 0;
            }
          }

          if (loc.first_line <= 0 || loc.last_line < loc.first_line) {
            // plan B: heuristic using preceding and following:
            if (loc.first_line <= 0 && preceding) {
              loc.first_line = preceding.last_line | 0;
              loc.first_column = preceding.last_column | 0;

              if (preceding.range) {
                loc.range[0] = actual.range[1] | 0;
              }
            }

            if ((loc.last_line <= 0 || loc.last_line < loc.first_line) && following) {
              loc.last_line = following.first_line | 0;
              loc.last_column = following.first_column | 0;

              if (following.range) {
                loc.range[1] = actual.range[0] | 0;
              }
            }

            // plan C?: see if the 'current' location is useful/sane too:
            if (loc.first_line <= 0 && current && (loc.last_line <= 0 || current.last_line <= loc.last_line)) {
              loc.first_line = current.first_line | 0;
              loc.first_column = current.first_column | 0;

              if (current.range) {
                loc.range[0] = current.range[0] | 0;
              }
            }

            if (loc.last_line <= 0 && current && (loc.first_line <= 0 || current.first_line >= loc.first_line)) {
              loc.last_line = current.last_line | 0;
              loc.last_column = current.last_column | 0;

              if (current.range) {
                loc.range[1] = current.range[1] | 0;
              }
            }
          }

          // sanitize: fix last_line BEFORE we fix first_line as we use the 'raw' value of the latter
          // or plan D heuristics to produce a 'sensible' last_line value:
          if (loc.last_line <= 0) {
            if (loc.first_line <= 0) {
              loc.first_line = this.yylloc.first_line;
              loc.last_line = this.yylloc.last_line;
              loc.first_column = this.yylloc.first_column;
              loc.last_column = this.yylloc.last_column;
              loc.range[0] = this.yylloc.range[0];
              loc.range[1] = this.yylloc.range[1];
            } else {
              loc.last_line = this.yylloc.last_line;
              loc.last_column = this.yylloc.last_column;
              loc.range[1] = this.yylloc.range[1];
            }
          }

          if (loc.first_line <= 0) {
            loc.first_line = loc.last_line;
            loc.first_column = 0; // loc.last_column;
            loc.range[1] = loc.range[0];
          }

          if (loc.first_column < 0) {
            loc.first_column = 0;
          }

          if (loc.last_column < 0) {
            loc.last_column = loc.first_column > 0 ? loc.first_column : 80;
          }

          return loc;
        },

        /**
             * return a string which displays the lines & columns of input which are referenced 
             * by the given location info range, plus a few lines of context.
             * 
             * This function pretty-prints the indicated section of the input, with line numbers 
             * and everything!
             * 
             * This function is very useful to provide highly readable error reports, while
             * the location range may be specified in various flexible ways:
             * 
             * - `loc` is the location info object which references the area which should be
             *   displayed and 'marked up': these lines & columns of text are marked up by `^`
             *   characters below each character in the entire input range.
             * 
             * - `context_loc` is the *optional* location info object which instructs this
             *   pretty-printer how much *leading* context should be displayed alongside
             *   the area referenced by `loc`. This can help provide context for the displayed
             *   error, etc.
             * 
             *   When this location info is not provided, a default context of 3 lines is
             *   used.
             * 
             * - `context_loc2` is another *optional* location info object, which serves
             *   a similar purpose to `context_loc`: it specifies the amount of *trailing*
             *   context lines to display in the pretty-print output.
             * 
             *   When this location info is not provided, a default context of 1 line only is
             *   used.
             * 
             * Special Notes:
             * 
             * - when the `loc`-indicated range is very large (about 5 lines or more), then
             *   only the first and last few lines of this block are printed while a
             *   `...continued...` message will be printed between them.
             * 
             *   This serves the purpose of not printing a huge amount of text when the `loc`
             *   range happens to be huge: this way a manageable & readable output results
             *   for arbitrary large ranges.
             * 
             * - this function can display lines of input which whave not yet been lexed.
             *   `prettyPrintRange()` can access the entire input!
             * 
             * @public
             * @this {RegExpLexer}
             */
        prettyPrintRange: function lexer_prettyPrintRange(loc, context_loc, context_loc2) {
          loc = this.deriveLocationInfo(loc, context_loc, context_loc2);
          const CONTEXT = 3;
          const CONTEXT_TAIL = 1;
          const MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT = 2;
          var input = this.matched + this._input;
          var lines = input.split('\n');
          var l0 = Math.max(1, context_loc ? context_loc.first_line : loc.first_line - CONTEXT);
          var l1 = Math.max(1, context_loc2 ? context_loc2.last_line : loc.last_line + CONTEXT_TAIL);
          var lineno_display_width = 1 + Math.log10(l1 | 1) | 0;
          var ws_prefix = new Array(lineno_display_width).join(' ');
          var nonempty_line_indexes = [];

          var rv = lines.slice(l0 - 1, l1 + 1).map(function injectLineNumber(line, index) {
            var lno = index + l0;
            var lno_pfx = (ws_prefix + lno).substr(-lineno_display_width);
            var rv = lno_pfx + ': ' + line;
            var errpfx = new Array(lineno_display_width + 1).join('^');
            var offset = 2 + 1;
            var len = 0;

            if (lno === loc.first_line) {
              offset += loc.first_column;

              len = Math.max(
                2,
                (lno === loc.last_line ? loc.last_column : line.length) - loc.first_column + 1
              );
            } else if (lno === loc.last_line) {
              len = Math.max(2, loc.last_column + 1);
            } else if (lno > loc.first_line && lno < loc.last_line) {
              len = Math.max(2, line.length + 1);
            }

            if (len) {
              var lead = new Array(offset).join('.');
              var mark = new Array(len).join('^');
              rv += '\n' + errpfx + lead + mark;

              if (line.trim().length > 0) {
                nonempty_line_indexes.push(index);
              }
            }

            rv = rv.replace(/\t/g, ' ');
            return rv;
          });

          // now make sure we don't print an overly large amount of error area: limit it 
          // to the top and bottom line count:
          if (nonempty_line_indexes.length > 2 * MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT) {
            var clip_start = nonempty_line_indexes[MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT - 1] + 1;
            var clip_end = nonempty_line_indexes[nonempty_line_indexes.length - MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT] - 1;
            var intermediate_line = new Array(lineno_display_width + 1).join(' ') + '  (...continued...)';
            intermediate_line += '\n' + new Array(lineno_display_width + 1).join('-') + '  (---------------)';
            rv.splice(clip_start, clip_end - clip_start + 1, intermediate_line);
          }

          return rv.join('\n');
        },

        /**
             * helper function, used to produce a human readable description as a string, given
             * the input `yylloc` location object.
             * 
             * Set `display_range_too` to TRUE to include the string character index position(s)
             * in the description if the `yylloc.range` is available.
             * 
             * @public
             * @this {RegExpLexer}
             */
        describeYYLLOC: function lexer_describe_yylloc(yylloc, display_range_too) {
          var l1 = yylloc.first_line;
          var l2 = yylloc.last_line;
          var c1 = yylloc.first_column;
          var c2 = yylloc.last_column;
          var dl = l2 - l1;
          var dc = c2 - c1;
          var rv;

          if (dl === 0) {
            rv = 'line ' + l1 + ', ';

            if (dc <= 1) {
              rv += 'column ' + c1;
            } else {
              rv += 'columns ' + c1 + ' .. ' + c2;
            }
          } else {
            rv = 'lines ' + l1 + '(column ' + c1 + ') .. ' + l2 + '(column ' + c2 + ')';
          }

          if (yylloc.range && display_range_too) {
            var r1 = yylloc.range[0];
            var r2 = yylloc.range[1] - 1;

            if (r2 <= r1) {
              rv += ' {String Offset: ' + r1 + '}';
            } else {
              rv += ' {String Offset range: ' + r1 + ' .. ' + r2 + '}';
            }
          }

          return rv;
        },

        /**
             * test the lexed token: return FALSE when not a match, otherwise return token.
             * 
             * `match` is supposed to be an array coming out of a regex match, i.e. `match[0]`
             * contains the actually matched text string.
             * 
             * Also move the input cursor forward and update the match collectors:
             * 
             * - `yytext`
             * - `yyleng`
             * - `match`
             * - `matches`
             * - `yylloc`
             * - `offset`
             * 
             * @public
             * @this {RegExpLexer}
             */
        test_match: function lexer_test_match(match, indexed_rule) {
          var token, lines, backup, match_str, match_str_len;

          if (this.options.backtrack_lexer) {
            // save context
            backup = {
              yylineno: this.yylineno,

              yylloc: {
                first_line: this.yylloc.first_line,
                last_line: this.yylloc.last_line,
                first_column: this.yylloc.first_column,
                last_column: this.yylloc.last_column,
                range: this.yylloc.range.slice(0)
              },

              yytext: this.yytext,
              match: this.match,
              matches: this.matches,
              matched: this.matched,
              yyleng: this.yyleng,
              offset: this.offset,
              _more: this._more,
              _input: this._input,

              //_signaled_error_token: this._signaled_error_token,
              yy: this.yy,

              conditionStack: this.conditionStack.slice(0),
              done: this.done
            };
          }

          match_str = match[0];
          match_str_len = match_str.length;

          // if (match_str.indexOf('\n') !== -1 || match_str.indexOf('\r') !== -1) {
          lines = match_str.split(/(?:\r\n?|\n)/g);

          if (lines.length > 1) {
            this.yylineno += lines.length - 1;
            this.yylloc.last_line = this.yylineno + 1;
            this.yylloc.last_column = lines[lines.length - 1].length;
          } else {
            this.yylloc.last_column += match_str_len;
          }

          // }
          this.yytext += match_str;

          this.match += match_str;
          this.matched += match_str;
          this.matches = match;
          this.yyleng = this.yytext.length;
          this.yylloc.range[1] += match_str_len;

          // previous lex rules MAY have invoked the `more()` API rather than producing a token:
          // those rules will already have moved this `offset` forward matching their match lengths,
          // hence we must only add our own match length now:
          this.offset += match_str_len;

          this._more = false;
          this._backtrack = false;
          this._input = this._input.slice(match_str_len);

          // calling this method:
          //
          //   function lexer__performAction(yy, yyrulenumber, YY_START) {...}
          token = this.performAction.call(
            this,
            this.yy,
            indexed_rule,
            this.conditionStack[this.conditionStack.length - 1] /* = YY_START */
          );

          // otherwise, when the action codes are all simple return token statements:
          //token = this.simpleCaseActionClusters[indexed_rule];

          if (this.done && this._input) {
            this.done = false;
          }

          if (token) {
            return token;
          } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
              this[k] = backup[k];
            }

            this.__currentRuleSet__ = null;
            return false; // rule action called reject() implying the next rule should be tested instead.
          } else if (this._signaled_error_token) {
            // produce one 'error' token as `.parseError()` in `reject()`
            // did not guarantee a failure signal by throwing an exception!
            token = this._signaled_error_token;

            this._signaled_error_token = false;
            return token;
          }

          return false;
        },

        /**
             * return next match in input
             * 
             * @public
             * @this {RegExpLexer}
             */
        next: function lexer_next() {
          if (this.done) {
            this.clear();
            return this.EOF;
          }

          if (!this._input) {
            this.done = true;
          }

          var token, match, tempMatch, index;

          if (!this._more) {
            this.clear();
          }

          var spec = this.__currentRuleSet__;

          if (!spec) {
            // Update the ruleset cache as we apparently encountered a state change or just started lexing.
            // The cache is set up for fast lookup -- we assume a lexer will switch states much less often than it will
            // invoke the `lex()` token-producing API and related APIs, hence caching the set for direct access helps
            // speed up those activities a tiny bit.
            spec = this.__currentRuleSet__ = this._currentRules();

            // Check whether a *sane* condition has been pushed before: this makes the lexer robust against
            // user-programmer bugs such as https://github.com/zaach/jison-lex/issues/19
            if (!spec || !spec.rules) {
              var lineno_msg = '';

              if (this.options.trackPosition) {
                lineno_msg = ' on line ' + (this.yylineno + 1);
              }

              var p = this.constructLexErrorInfo(
                'Internal lexer engine error' + lineno_msg + ': The lex grammar programmer pushed a non-existing condition name "' + this.topState() + '"; this is a fatal error and should be reported to the application programmer team!',
                false
              );

              // produce one 'error' token until this situation has been resolved, most probably by parse termination!
              return this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
            }
          }

          var rule_ids = spec.rules;
          var regexes = spec.__rule_regexes;
          var len = spec.__rule_count;

          // Note: the arrays are 1-based, while `len` itself is a valid index,
          // hence the non-standard less-or-equal check in the next loop condition!
          for (var i = 1; i <= len; i++) {
            tempMatch = this._input.match(regexes[i]);

            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
              match = tempMatch;
              index = i;

              if (this.options.backtrack_lexer) {
                token = this.test_match(tempMatch, rule_ids[i]);

                if (token !== false) {
                  return token;
                } else if (this._backtrack) {
                  match = undefined;
                  continue; // rule action called reject() implying a rule MISmatch.
                } else {
                  // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                  return false;
                }
              } else if (!this.options.flex) {
                break;
              }
            }
          }

          if (match) {
            token = this.test_match(match, rule_ids[index]);

            if (token !== false) {
              return token;
            }

            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
          }

          if (!this._input) {
            this.done = true;
            this.clear();
            return this.EOF;
          } else {
            var lineno_msg = '';

            if (this.options.trackPosition) {
              lineno_msg = ' on line ' + (this.yylineno + 1);
            }

            var p = this.constructLexErrorInfo(
              'Lexical error' + lineno_msg + ': Unrecognized text.',
              this.options.lexerErrorsAreRecoverable
            );

            var pendingInput = this._input;
            var activeCondition = this.topState();
            var conditionStackDepth = this.conditionStack.length;
            token = this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;

            if (token === this.ERROR) {
              // we can try to recover from a lexer error that `parseError()` did not 'recover' for us
              // by moving forward at least one character at a time IFF the (user-specified?) `parseError()`
              // has not consumed/modified any pending input or changed state in the error handler:
              if (!this.matches && // and make sure the input has been modified/consumed ...
              pendingInput === this._input && // ...or the lexer state has been modified significantly enough
              // to merit a non-consuming error handling action right now.
              activeCondition === this.topState() && conditionStackDepth === this.conditionStack.length) {
                this.input();
              }
            }

            return token;
          }
        },

        /**
             * return next match that has a token
             * 
             * @public
             * @this {RegExpLexer}
             */
        lex: function lexer_lex() {
          var r;

          // allow the PRE/POST handlers set/modify the return token for maximum flexibility of the generated lexer:
          if (typeof this.pre_lex === 'function') {
            r = this.pre_lex.call(this, 0);
          }

          if (typeof this.options.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.pre_lex.call(this, r) || r;
          }

          if (this.yy && typeof this.yy.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.pre_lex.call(this, r) || r;
          }

          while (!r) {
            r = this.next();
          }

          if (this.yy && typeof this.yy.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.post_lex.call(this, r) || r;
          }

          if (typeof this.options.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.post_lex.call(this, r) || r;
          }

          if (typeof this.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.post_lex.call(this, r) || r;
          }

          return r;
        },

        /**
             * return next match that has a token. Identical to the `lex()` API but does not invoke any of the 
             * `pre_lex()` nor any of the `post_lex()` callbacks.
             * 
             * @public
             * @this {RegExpLexer}
             */
        fastLex: function lexer_fastLex() {
          var r;

          while (!r) {
            r = this.next();
          }

          return r;
        },

        /**
             * return info about the lexer state that can help a parser or other lexer API user to use the
             * most efficient means available. This API is provided to aid run-time performance for larger
             * systems which employ this lexer.
             * 
             * @public
             * @this {RegExpLexer}
             */
        canIUse: function lexer_canIUse() {
          var rv = {
            fastLex: !(typeof this.pre_lex === 'function' || typeof this.options.pre_lex === 'function' || this.yy && typeof this.yy.pre_lex === 'function' || this.yy && typeof this.yy.post_lex === 'function' || typeof this.options.post_lex === 'function' || typeof this.post_lex === 'function') && typeof this.fastLex === 'function'
          };

          return rv;
        },

        /**
             * backwards compatible alias for `pushState()`;
             * the latter is symmetrical with `popState()` and we advise to use
             * those APIs in any modern lexer code, rather than `begin()`.
             * 
             * @public
             * @this {RegExpLexer}
             */
        begin: function lexer_begin(condition) {
          return this.pushState(condition);
        },

        /**
             * activates a new lexer condition state (pushes the new lexer
             * condition state onto the condition stack)
             * 
             * @public
             * @this {RegExpLexer}
             */
        pushState: function lexer_pushState(condition) {
          this.conditionStack.push(condition);
          this.__currentRuleSet__ = null;
          return this;
        },

        /**
             * pop the previously active lexer condition state off the condition
             * stack
             * 
             * @public
             * @this {RegExpLexer}
             */
        popState: function lexer_popState() {
          var n = this.conditionStack.length - 1;

          if (n > 0) {
            this.__currentRuleSet__ = null;
            return this.conditionStack.pop();
          } else {
            return this.conditionStack[0];
          }
        },

        /**
             * return the currently active lexer condition state; when an index
             * argument is provided it produces the N-th previous condition state,
             * if available
             * 
             * @public
             * @this {RegExpLexer}
             */
        topState: function lexer_topState(n) {
          n = this.conditionStack.length - 1 - Math.abs(n || 0);

          if (n >= 0) {
            return this.conditionStack[n];
          } else {
            return 'INITIAL';
          }
        },

        /**
             * (internal) determine the lexer rule set which is active for the
             * currently active lexer condition state
             * 
             * @public
             * @this {RegExpLexer}
             */
        _currentRules: function lexer__currentRules() {
          if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]];
          } else {
            return this.conditions['INITIAL'];
          }
        },

        /**
             * return the number of states currently on the stack
             * 
             * @public
             * @this {RegExpLexer}
             */
        stateStackSize: function lexer_stateStackSize() {
          return this.conditionStack.length;
        },

        options: {
          xregexp: true,
          ranges: true,
          trackPosition: true,
          easy_keyword_rules: true
        },

        JisonLexerError: JisonLexerError,

        performAction: function lexer__performAction(yy, yyrulenumber, YY_START) {
          var yy_ = this;

          switch (yyrulenumber) {
          case 0:
            /*! Conditions:: INITIAL */
            /*! Rule::       \s+ */
            /* skip whitespace */
            break;
          case 3:
            /*! Conditions:: INITIAL */
            /*! Rule::       \[{ID}\] */
            yy_.yytext = this.matches[1];

            return 9;
          default:
            return this.simpleCaseActionClusters[yyrulenumber];
          }
        },

        simpleCaseActionClusters: {
          /*! Conditions:: INITIAL */
          /*! Rule::       {ID} */
          1: 10,

          /*! Conditions:: INITIAL */
          /*! Rule::       \$end\b */
          2: 10,

          /*! Conditions:: INITIAL */
          /*! Rule::       '{QUOTED_STRING_CONTENT}' */
          4: 10,

          /*! Conditions:: INITIAL */
          /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
          5: 10,

          /*! Conditions:: INITIAL */
          /*! Rule::       \. */
          6: 10,

          /*! Conditions:: INITIAL */
          /*! Rule::       \( */
          7: 4,

          /*! Conditions:: INITIAL */
          /*! Rule::       \) */
          8: 5,

          /*! Conditions:: INITIAL */
          /*! Rule::       \* */
          9: 6,

          /*! Conditions:: INITIAL */
          /*! Rule::       \? */
          10: 7,

          /*! Conditions:: INITIAL */
          /*! Rule::       \| */
          11: 3,

          /*! Conditions:: INITIAL */
          /*! Rule::       \+ */
          12: 8,

          /*! Conditions:: INITIAL */
          /*! Rule::       $ */
          13: 1
        },

        rules: [
          /*  0: */  /^(?:\s+)/,
          /*  1: */  new XRegExp__default['default']('^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*))', ''),
          /*  2: */  /^(?:\$end\b)/,
          /*  3: */  new XRegExp__default['default']('^(?:\\[([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*)\\])', ''),
          /*  4: */  /^(?:'((?:\\'|\\[^']|[^'\\])*)')/,
          /*  5: */  /^(?:"((?:\\"|\\[^"]|[^"\\])*)")/,
          /*  6: */  /^(?:\.)/,
          /*  7: */  /^(?:\()/,
          /*  8: */  /^(?:\))/,
          /*  9: */  /^(?:\*)/,
          /* 10: */  /^(?:\?)/,
          /* 11: */  /^(?:\|)/,
          /* 12: */  /^(?:\+)/,
          /* 13: */  /^(?:$)/
        ],

        conditions: {
          'INITIAL': {
            rules: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
            inclusive: true
          }
        }
      };

      return lexer;
    }();
    parser.lexer = lexer;




    function Parser() {
        this.yy = {};
    }
    Parser.prototype = parser;
    parser.Parser = Parser;

    function yyparse() {
        return parser.parse.apply(parser, arguments);
    }



    var parser$1 = {
        parser,
        Parser,
        parse: yyparse,
        
    };

    // WARNING: this regex MUST match the regex for `ID` in ebnf-parser::bnf.l jison language lexer spec! (`ID = [{ALPHA}]{ALNUM}*`)
    //
    // This is the base XRegExp ID regex used in many places; this should match the ID macro definition in the EBNF/BNF parser et al as well!
    const ID_REGEX_BASE = '[\\p{Alphabetic}_][\\p{Alphabetic}_\\p{Number}]*';

    // produce a unique production symbol.
    // Use this to produce rule productions from transformed EBNF which are
    // guaranteed not to collide with previously generated / already existing
    // rules (~ symbols).
    function generateUniqueSymbol(id, postfix, opts) {
        var sym = id + postfix;
        if (opts.grammar[sym]) {
            var i = 2;              // the first occurrence won't have a number, this is already a collision, so start numbering at *2*.
            do {
                sym = id + postfix + i;
                i++;
            } while (opts.grammar[sym]);
        }
        return sym;
    }

    function generatePushAction(handle, offset) {
        var terms = handle.terms;
        var rv = [];

        for (var i = 0, len = terms.length; i < len; i++) {
            rv.push('$' + (i + offset));
        }
        rv = rv.join(', ');
        // and make sure we contain a term series unambiguously, i.e. anything more complex than
        // a single term inside an EBNF check is produced as an array so we can differentiate
        // between */+/? EBNF operator results and groups of tokens per individual match.
        if (len > 1) {
            rv = '[' + rv + ']';
        }
        return rv;
    }

    function transformExpression(e, opts, emit) {
        var type = e[0],
            value = e[1],
            name = false,
            has_transformed = 0;
        var list, n;

        if (type === 'xalias') {
            type = e[1];
            value = e[2];
            name = e[3];
            if (type) {
                e = e.slice(1);
            } else {
                e = value;
                type = e[0];
                value = e[1];
            }
        }

        if (type === 'symbol') {
            n = e[1];
            emit(n + (name ? '[' + name + ']' : ''));
        } else if (type === '+') {
            if (!name) {
                name = generateUniqueSymbol(opts.production, '_repetition_plus', opts);
            }
            emit(name);

            has_transformed = 1;

            opts = optsForProduction(name, opts.grammar);
            list = transformExpressionList([value], opts);
            opts.grammar[name] = [
                [
                    list.fragment,
                    '$$ = [' + generatePushAction(list, 1) + '];'
                ],
                [
                    name + ' ' + list.fragment,
                    '$1.push(' + generatePushAction(list, 2) + ');\n$$ = $1;'
                ]
            ];
        } else if (type === '*') {
            if (!name) {
                name = generateUniqueSymbol(opts.production, '_repetition', opts);
            }
            emit(name);

            has_transformed = 1;

            opts = optsForProduction(name, opts.grammar);
            list = transformExpressionList([value], opts);
            opts.grammar[name] = [
                [
                    '',
                    '$$ = [];'
                ],
                [
                    name + ' ' + list.fragment,
                    '$1.push(' + generatePushAction(list, 2) + ');\n$$ = $1;'
                ]
            ];
        } else if (type === '?') {
            if (!name) {
                name = generateUniqueSymbol(opts.production, '_option', opts);
            }
            emit(name);

            has_transformed = 1;

            opts = optsForProduction(name, opts.grammar);
            list = transformExpressionList([value], opts);
            // you want to be able to check if 0 or 1 occurrences were recognized: since jison
            // by default *copies* the lexer token value, i.e. `$$ = $1` is the (optional) default action,
            // we will need to set the action up explicitly in case of the 0-count match:
            // `$$ = undefined`.
            //
            // Note that we MUST return an array as the
            // '1 occurrence' match CAN carry multiple terms, e.g. in constructs like
            // `(T T T)?`, which would otherwise be unrecognizable from the `T*` construct.
            opts.grammar[name] = [
                [
                    '',
                    '$$ = undefined;'
                ],
                [
                    list.fragment,
                    '$$ = ' + generatePushAction(list, 1) + ';'
                ]
            ];
        } else if (type === '()') {
            if (value.length === 1 && !name) {
                list = transformExpressionList(value[0], opts);
                if (list.first_transformed_term_index) {
                    has_transformed = list.first_transformed_term_index;
                }
                emit(list);
            } else {
                if (!name) {
                    name = generateUniqueSymbol(opts.production, '_group', opts);
                }
                emit(name);

                has_transformed = 1;

                opts = optsForProduction(name, opts.grammar);
                opts.grammar[name] = value.map(function (handle) {
                    var list = transformExpressionList(handle, opts);
                    return [
                        list.fragment,
                        '$$ = ' + generatePushAction(list, 1) + ';'
                    ];
                });
            }
        }

        return has_transformed;
    }

    function transformExpressionList(list, opts) {
        var first_transformed_term_index = false;
        var terms = list.reduce(function (tot, e) {
            var ci = tot.length;

            var has_transformed = transformExpression(e, opts, function (name) {
                if (name.terms) {
                    tot.push.apply(tot, name.terms);
                } else {
                    tot.push(name);
                }
            });

            if (has_transformed) {
                first_transformed_term_index = ci + has_transformed;
            }
            return tot;
        }, []);

        return {
            fragment: terms.join(' '),
            terms: terms,
            first_transformed_term_index: first_transformed_term_index              // 1-based index
        };
    }

    function optsForProduction(id, grammar) {
        return {
            production: id,
            grammar: grammar
        };
    }

    function transformProduction(id, production, grammar) {
        var transform_opts = optsForProduction(id, grammar);
        return production.map(function (handle) {
            var action = null,
                opts = null;
            var i, len, n;

            if (typeof handle !== 'string') {
                action = handle[1];
                opts = handle[2];
                handle = handle[0];
            }
            var expressions = parser$1.parse(handle);

            var list = transformExpressionList(expressions, transform_opts);

            var ret = [list.fragment];
            if (action) {
                // make sure the action doesn't address any inner items.
                if (list.first_transformed_term_index) {
                    // seek out all names and aliases; strip out literal tokens first as those cannot serve as $names:
                    var alist = list.terms; // rhs.replace(/'[^']+'/g, '~').replace(/"[^"]+"/g, '~').split(' ');

                    var alias_re = new XRegExp__default['default'](`\\[${ID_REGEX_BASE}\\]`);
                    var term_re = new XRegExp__default['default'](`^${ID_REGEX_BASE}$`);
                    // and collect the PERMITTED aliases: the names of the terms and all the remaining aliases
                    var good_aliases = {};
                    var alias_cnt = {};
                    var donotalias = {};

                    // WARNING: this replicates the knowledge/code of jison.js::addName()
                    var addName = function addNameEBNF(s, i) {
                        var base = s.replace(/[0-9]+$/, '');
                        var dna = donotalias[base];

                        if (good_aliases[s]) {
                            alias_cnt[s]++;
                            if (!dna) {
                                good_aliases[s + alias_cnt[s]] = i + 1;
                                alias_cnt[s + alias_cnt[s]] = 1;
                            }
                        } else {
                            good_aliases[s] = i + 1;
                            alias_cnt[s] = 1;
                            if (!dna) {
                                good_aliases[s + alias_cnt[s]] = i + 1;
                                alias_cnt[s + alias_cnt[s]] = 1;
                            }
                        }
                    };

                    // WARNING: this replicates the knowledge/code of jison.js::markBasename()
                    var markBasename = function markBasenameEBNF(s) {
                        if (/[0-9]$/.test(s)) {
                            s = s.replace(/[0-9]+$/, '');
                            donotalias[s] = true;
                        }
                    };

                    // mark both regular and aliased names, e.g., `id[alias1]` and `id1`
                    //
                    // WARNING: this replicates the knowledge/code of jison.js::markBasename()+addName() usage
                    for (i = 0, len = alist.length; i < len; i++) {
                        var term = alist[i];
                        var alias = term.match(alias_re);
                        if (alias) {
                            markBasename(alias[0].substr(1, alias[0].length - 2));
                            term = term.replace(alias_re, '');
                        }
                        if (term.match(term_re)) {
                            markBasename(term);
                        }
                    }
                    // then check & register both regular and aliased names, e.g., `id[alias1]` and `id1`
                    for (i = 0, len = alist.length; i < len; i++) {
                        var term = alist[i];
                        var alias = term.match(alias_re);
                        if (alias) {
                            addName(alias[0].substr(1, alias[0].length - 2), i);
                            term = term.replace(alias_re, '');
                        }
                        if (term.match(term_re)) {
                            addName(term, i);
                        }
                    }

                    // now scan the action for all named and numeric semantic values ($nonterminal / $1 / @1, ##1, ...)
                    //
                    // Note that `#name` are straight **static** symbol translations, which are okay as they don't
                    // require access to the parse stack: `#n` references can be resolved completely 
                    // at grammar compile time.
                    //
                    var nameref_re = new XRegExp__default['default'](`(?:[$@]|##)${ID_REGEX_BASE}`, 'g');
                    var named_spots = nameref_re.exec(action);
                    var numbered_spots = action.match(/(?:[$@]|##)[0-9]+\b/g);
                    var max_term_index = list.terms.length;

                    // loop through the XRegExp alias regex matches in `action`
                    while (named_spots) {
                        n = named_spots[0].replace(/^(?:[$@]|##)/, '');
                        if (!good_aliases[n]) {
                            throw new Error('The action block references the named alias "' + n + '" ' +
                                            'which is not available in production "' + handle + '"; ' +
                                            'it probably got removed by the EBNF rule rewrite process.\n' +
                                            'Be reminded that you cannot reference sub-elements within EBNF */+/? groups, ' +
                                            'only the outer-most EBNF group alias will remain available at all times ' +
                                            'due to the EBNF-to-BNF rewrite process.');
                        }

                        if (alias_cnt[n] !== 1) {
                            throw new Error('The action block references the ambiguous named alias or term reference "' + n + '" ' +
                                            'which is mentioned ' + alias_cnt[n] + ' times in production "' + handle + '", implicit and explicit aliases included.\n' +
                                            'You should either provide unambiguous = uniquely named aliases for these terms or use numeric index references (e.g. `$3`) as a stop-gap in your action code.\n' +
                                            'Be reminded that you cannot reference sub-elements within EBNF */+/? groups, ' +
                                            'only the outer-most EBNF group alias will remain available at all times ' +
                                            'due to the EBNF-to-BNF rewrite process.');
                        }
                        //assert(good_aliases[n] <= max_term_index, 'max term index');

                        named_spots = nameref_re.exec(action);
                    }
                    if (numbered_spots) {
                        for (i = 0, len = numbered_spots.length; i < len; i++) {
                            n = parseInt(numbered_spots[i].replace(/^(?:[$@]|##)/, ''));
                            if (n > max_term_index) {
                                /* @const */ var n_suffixes = [ 'st', 'nd', 'rd', 'th' ];
                                throw new Error('The action block references the ' + n + n_suffixes[Math.max(0, Math.min(3, n - 1))] + ' term, ' +
                                                'which is not available in production "' + handle + '"; ' +
                                                'Be reminded that you cannot reference sub-elements within EBNF */+/? groups, ' +
                                                'only the outer-most EBNF group alias will remain available at all times ' +
                                                'due to the EBNF-to-BNF rewrite process.');
                            }
                        }
                    }
                }
                ret.push(action);
            }
            if (opts) {
                ret.push(opts);
            }

            if (ret.length === 1) {
                return ret[0];
            } else {
                return ret;
            }
        });
    }
    var ref_list;
    var ref_names;

    // create a deep copy of the input, so we will keep the input constant.
    function deepClone(from, sub) {
        if (sub == null) {
            ref_list = [];
            ref_names = [];
            sub = 'root';
        }
        if (typeof from === 'function') return from;
        if (from == null || typeof from !== 'object') return from;
        if (from.constructor !== Object && from.constructor !== Array) {
            return from;
        }

        for (var i = 0, len = ref_list.length; i < len; i++) {
            if (ref_list[i] === from) {
                throw new Error('[Circular/Xref:' + ref_names[i] + ']');   // circular or cross reference
            }
        }
        ref_list.push(from);
        ref_names.push(sub);
        sub += '.';

        var to = new from.constructor();
        for (var name in from) {
            to[name] = deepClone(from[name], sub + name);
        }
        return to;
    }

    function transformGrammar(grammar) {
        grammar = deepClone(grammar);

        Object.keys(grammar).forEach(function transformGrammarForKey(id) {
            grammar[id] = transformProduction(id, grammar[id], grammar);
        });

        return grammar;
    }
    function transform(ebnf) {
        var rv = transformGrammar(ebnf);

        return rv;
    }

    // See also:
    // http://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/#35881508
    // but we keep the prototype.constructor and prototype.name assignment lines too for compatibility
    // with userland code which might access the derived class in a 'classic' way.
    function JisonParserError$1(msg, hash) {

        Object.defineProperty(this, 'name', {
            enumerable: false,
            writable: false,
            value: 'JisonParserError'
        });

        if (msg == null) msg = '???';

        Object.defineProperty(this, 'message', {
            enumerable: false,
            writable: true,
            value: msg
        });

        this.hash = hash;

        var stacktrace;
        if (hash && hash.exception instanceof Error) {
            var ex2 = hash.exception;
            this.message = ex2.message || msg;
            stacktrace = ex2.stack;
        }
        if (!stacktrace) {
            if (Error.hasOwnProperty('captureStackTrace')) {        // V8/Chrome engine
                Error.captureStackTrace(this, this.constructor);
            } else {
                stacktrace = (new Error(msg)).stack;
            }
        }
        if (stacktrace) {
            Object.defineProperty(this, 'stack', {
                enumerable: false,
                writable: false,
                value: stacktrace
            });
        }
    }

    if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(JisonParserError$1.prototype, Error.prototype);
    } else {
        JisonParserError$1.prototype = Object.create(Error.prototype);
    }
    JisonParserError$1.prototype.constructor = JisonParserError$1;
    JisonParserError$1.prototype.name = 'JisonParserError';




            // helper: reconstruct the productions[] table
            function bp$1(s) {
                var rv = [];
                var p = s.pop;
                var r = s.rule;
                for (var i = 0, l = p.length; i < l; i++) {
                    rv.push([
                        p[i],
                        r[i]
                    ]);
                }
                return rv;
            }
        


            // helper: reconstruct the defaultActions[] table
            function bda(s) {
                var rv = {};
                var d = s.idx;
                var g = s.goto;
                for (var i = 0, l = d.length; i < l; i++) {
                    var j = d[i];
                    rv[j] = g[i];
                }
                return rv;
            }
        


            // helper: reconstruct the 'goto' table
            function bt$1(s) {
                var rv = [];
                var d = s.len;
                var y = s.symbol;
                var t = s.type;
                var a = s.state;
                var m = s.mode;
                var g = s.goto;
                for (var i = 0, l = d.length; i < l; i++) {
                    var n = d[i];
                    var q = {};
                    for (var j = 0; j < n; j++) {
                        var z = y.shift();
                        switch (t.shift()) {
                        case 2:
                            q[z] = [
                                m.shift(),
                                g.shift()
                            ];
                            break;

                        case 0:
                            q[z] = a.shift();
                            break;

                        default:
                            // type === 1: accept
                            q[z] = [
                                3
                            ];
                        }
                    }
                    rv.push(q);
                }
                return rv;
            }
        


            // helper: runlength encoding with increment step: code, length: step (default step = 0)
            // `this` references an array
            function s$1(c, l, a) {
                a = a || 0;
                for (var i = 0; i < l; i++) {
                    this.push(c);
                    c += a;
                }
            }

            // helper: duplicate sequence from *relative* offset and length.
            // `this` references an array
            function c$1(i, l) {
                i = this.length - i;
                for (l += i; i < l; i++) {
                    this.push(this[i]);
                }
            }

            // helper: unpack an array using helpers and data, all passed in an array argument 'a'.
            function u$1(a) {
                var rv = [];
                for (var i = 0, l = a.length; i < l; i++) {
                    var e = a[i];
                    // Is this entry a helper function?
                    if (typeof e === 'function') {
                        i++;
                        e.apply(rv, a[i]);
                    } else {
                        rv.push(e);
                    }
                }
                return rv;
            }
        

    var parser$2 = {
        // Code Generator Information Report
        // ---------------------------------
        //
        // Options:
        //
        //   default action mode: ............. ["classic","merge"]
        //   test-compile action mode: ........ "parser:*,lexer:*"
        //   try..catch: ...................... true
        //   default resolve on conflict: ..... true
        //   on-demand look-ahead: ............ false
        //   error recovery token skip maximum: 3
        //   yyerror in parse actions is: ..... NOT recoverable,
        //   yyerror in lexer actions and other non-fatal lexer are:
        //   .................................. NOT recoverable,
        //   debug grammar/output: ............ false
        //   has partial LR conflict upgrade:   true
        //   rudimentary token-stack support:   false
        //   parser table compression mode: ... 2
        //   export debug tables: ............. false
        //   export *all* tables: ............. false
        //   module type: ..................... es
        //   parser engine type: .............. lalr
        //   output main() in the module: ..... true
        //   has user-specified main(): ....... false
        //   has user-specified require()/import modules for main():
        //   .................................. false
        //   number of expected conflicts: .... 0
        //
        //
        // Parser Analysis flags:
        //
        //   no significant actions (parser is a language matcher only):
        //   .................................. false
        //   uses yyleng: ..................... false
        //   uses yylineno: ................... false
        //   uses yytext: ..................... false
        //   uses yylloc: ..................... false
        //   uses ParseError API: ............. false
        //   uses YYERROR: .................... true
        //   uses YYRECOVERING: ............... false
        //   uses YYERROK: .................... false
        //   uses YYCLEARIN: .................. false
        //   tracks rule values: .............. true
        //   assigns rule values: ............. true
        //   uses location tracking: .......... true
        //   assigns location: ................ true
        //   uses yystack: .................... false
        //   uses yysstack: ................... false
        //   uses yysp: ....................... true
        //   uses yyrulelength: ............... false
        //   uses yyMergeLocationInfo API: .... true
        //   has error recovery: .............. true
        //   has error reporting: ............. true
        //
        // --------- END OF REPORT -----------

    trace: function no_op_trace() { },
    JisonParserError: JisonParserError$1,
    yy: {},
    options: {
      type: "lalr",
      hasPartialLrUpgradeOnConflict: true,
      errorRecoveryTokenDiscardCount: 3
    },
    symbols_: {
      "$accept": 0,
      "$end": 1,
      "%%": 14,
      "(": 7,
      ")": 8,
      "*": 9,
      "+": 11,
      ":": 5,
      ";": 4,
      "=": 3,
      "?": 10,
      "ACTION": 15,
      "ACTION_BODY": 43,
      "ALIAS": 39,
      "ARROW_ACTION": 42,
      "CODE": 46,
      "DEBUG": 19,
      "EBNF": 20,
      "EOF": 1,
      "EOF_ID": 40,
      "EPSILON": 38,
      "ID": 24,
      "IMPORT": 22,
      "INCLUDE": 44,
      "INIT_CODE": 23,
      "INTEGER": 37,
      "LEFT": 33,
      "LEX_BLOCK": 17,
      "NAME": 25,
      "NONASSOC": 35,
      "OPTIONS": 27,
      "OPTIONS_END": 28,
      "OPTION_STRING_VALUE": 29,
      "OPTION_VALUE": 30,
      "PARSER_TYPE": 32,
      "PARSE_PARAM": 31,
      "PATH": 45,
      "PREC": 41,
      "RIGHT": 34,
      "START": 16,
      "STRING": 26,
      "TOKEN": 18,
      "TOKEN_TYPE": 36,
      "UNKNOWN_DECL": 21,
      "action": 85,
      "action_body": 86,
      "action_comments_body": 87,
      "action_ne": 84,
      "associativity": 61,
      "declaration": 51,
      "declaration_list": 50,
      "error": 2,
      "expression": 79,
      "extra_parser_module_code": 88,
      "full_token_definitions": 63,
      "grammar": 69,
      "handle": 76,
      "handle_action": 75,
      "handle_list": 74,
      "handle_sublist": 77,
      "id": 83,
      "id_list": 68,
      "import_name": 53,
      "import_path": 54,
      "include_macro_code": 89,
      "init_code_name": 52,
      "module_code_chunk": 90,
      "one_full_token": 64,
      "operator": 60,
      "option": 57,
      "option_list": 56,
      "optional_action_header_block": 49,
      "optional_end_block": 48,
      "optional_module_code_chunk": 91,
      "optional_production_description": 73,
      "optional_token_type": 65,
      "options": 55,
      "parse_params": 58,
      "parser_type": 59,
      "prec": 81,
      "production": 71,
      "production_id": 72,
      "production_list": 70,
      "spec": 47,
      "suffix": 80,
      "suffixed_expression": 78,
      "symbol": 82,
      "token_description": 67,
      "token_list": 62,
      "token_value": 66,
      "{": 12,
      "|": 6,
      "}": 13
    },
    terminals_: {
      1: "EOF",
      2: "error",
      3: "=",
      4: ";",
      5: ":",
      6: "|",
      7: "(",
      8: ")",
      9: "*",
      10: "?",
      11: "+",
      12: "{",
      13: "}",
      14: "%%",
      15: "ACTION",
      16: "START",
      17: "LEX_BLOCK",
      18: "TOKEN",
      19: "DEBUG",
      20: "EBNF",
      21: "UNKNOWN_DECL",
      22: "IMPORT",
      23: "INIT_CODE",
      24: "ID",
      25: "NAME",
      26: "STRING",
      27: "OPTIONS",
      28: "OPTIONS_END",
      29: "OPTION_STRING_VALUE",
      30: "OPTION_VALUE",
      31: "PARSE_PARAM",
      32: "PARSER_TYPE",
      33: "LEFT",
      34: "RIGHT",
      35: "NONASSOC",
      36: "TOKEN_TYPE",
      37: "INTEGER",
      38: "EPSILON",
      39: "ALIAS",
      40: "EOF_ID",
      41: "PREC",
      42: "ARROW_ACTION",
      43: "ACTION_BODY",
      44: "INCLUDE",
      45: "PATH",
      46: "CODE"
    },
    TERROR: 2,
        EOF: 1,

        // internals: defined here so the object *structure* doesn't get modified by parse() et al,
        // thus helping JIT compilers like Chrome V8.
        originalQuoteName: null,
        originalParseError: null,
        cleanupAfterParse: null,
        constructParseErrorInfo: null,
        yyMergeLocationInfo: null,
        copy_yytext: null,
        copy_yylloc: null,

        __reentrant_call_depth: 0,      // INTERNAL USE ONLY
        __error_infos: [],              // INTERNAL USE ONLY: the set of parseErrorInfo objects created since the last cleanup
        __error_recovery_infos: [],     // INTERNAL USE ONLY: the set of parseErrorInfo objects created since the last cleanup

        // APIs which will be set up depending on user action code analysis:
        //yyRecovering: 0,
        //yyErrOk: 0,
        //yyClearIn: 0,

        // Helper APIs
        // -----------

        // Helper function which can be overridden by user code later on: put suitable quotes around
        // literal IDs in a description string.
        quoteName: function parser_quoteName(id_str) {

            return '"' + id_str + '"';
        },

        // Return the name of the given symbol (terminal or non-terminal) as a string, when available.
        //
        // Return NULL when the symbol is unknown to the parser.
        getSymbolName: function parser_getSymbolName(symbol) {

            if (this.terminals_[symbol]) {
                return this.terminals_[symbol];
            }

            // Otherwise... this might refer to a RULE token i.e. a non-terminal: see if we can dig that one up.
            //
            // An example of this may be where a rule's action code contains a call like this:
            //
            //      parser.getSymbolName(#$)
            //
            // to obtain a human-readable name of the current grammar rule.
            var s = this.symbols_;
            for (var key in s) {
                if (s[key] === symbol) {
                    return key;
                }
            }
            return null;
        },

        // Return a more-or-less human-readable description of the given symbol, when available,
        // or the symbol itself, serving as its own 'description' for lack of something better to serve up.
        //
        // Return NULL when the symbol is unknown to the parser.
        describeSymbol: function parser_describeSymbol(symbol) {

            if (symbol !== this.EOF && this.terminal_descriptions_ && this.terminal_descriptions_[symbol]) {
                return this.terminal_descriptions_[symbol];
            }
            else if (symbol === this.EOF) {
                return 'end of input';
            }
            var id = this.getSymbolName(symbol);
            if (id) {
                return this.quoteName(id);
            }
            return null;
        },

        // Produce a (more or less) human-readable list of expected tokens at the point of failure.
        //
        // The produced list may contain token or token set descriptions instead of the tokens
        // themselves to help turning this output into something that easier to read by humans
        // unless `do_not_describe` parameter is set, in which case a list of the raw, *numeric*,
        // expected terminals and nonterminals is produced.
        //
        // The returned list (array) will not contain any duplicate entries.
        collect_expected_token_set: function parser_collect_expected_token_set(state, do_not_describe) {

            var TERROR = this.TERROR;
            var tokenset = [];
            var check = {};
            // Has this (error?) state been outfitted with a custom expectations description text for human consumption?
            // If so, use that one instead of the less palatable token set.
            if (!do_not_describe && this.state_descriptions_ && this.state_descriptions_[state]) {
                return [
                    this.state_descriptions_[state]
                ];
            }
            for (var p in this.table[state]) {
                p = +p;
                if (p !== TERROR) {
                    var d = do_not_describe ? p : this.describeSymbol(p);
                    if (d && !check[d]) {
                        tokenset.push(d);
                        check[d] = true;        // Mark this token description as already mentioned to prevent outputting duplicate entries.
                    }
                }
            }
            return tokenset;
        },
    productions_: bp$1({
      pop: u$1([
      s$1,
      [47, 3],
      48,
      48,
      s$1,
      [49, 3],
      s$1,
      [50, 3],
      s$1,
      [51, 20],
      s$1,
      [52, 3],
      53,
      53,
      54,
      54,
      s$1,
      [55, 3],
      56,
      56,
      s$1,
      [57, 6],
      58,
      58,
      59,
      59,
      60,
      60,
      s$1,
      [61, 3],
      62,
      62,
      63,
      63,
      s$1,
      [64, 3],
      65,
      s$1,
      [65, 4, 1],
      68,
      69,
      70,
      70,
      s$1,
      [71, 3],
      72,
      72,
      73,
      73,
      s$1,
      [74, 4],
      s$1,
      [75, 3],
      76,
      76,
      77,
      77,
      78,
      78,
      s$1,
      [79, 5],
      s$1,
      [80, 4],
      s$1,
      [81, 3],
      82,
      82,
      83,
      s$1,
      [84, 4],
      s$1,
      [85, 3],
      s$1,
      [86, 5],
      87,
      87,
      88,
      88,
      89,
      89,
      s$1,
      [90, 3],
      91,
      91
    ]),
      rule: u$1([
      5,
      5,
      3,
      0,
      2,
      0,
      s$1,
      [2, 3],
      c$1,
      [4, 3],
      1,
      1,
      c$1,
      [3, 3],
      s$1,
      [1, 6],
      s$1,
      [3, 5],
      s$1,
      [2, 3],
      c$1,
      [15, 9],
      c$1,
      [11, 4],
      c$1,
      [20, 7],
      s$1,
      [2, 4],
      s$1,
      [1, 3],
      2,
      1,
      2,
      2,
      c$1,
      [15, 3],
      0,
      c$1,
      [11, 7],
      c$1,
      [36, 4],
      3,
      3,
      1,
      0,
      3,
      c$1,
      [39, 4],
      c$1,
      [80, 4],
      c$1,
      [9, 3],
      c$1,
      [39, 4],
      3,
      3,
      c$1,
      [34, 5],
      c$1,
      [40, 5],
      c$1,
      [32, 3],
      s$1,
      [1, 3],
      0,
      0,
      1,
      5,
      4,
      4,
      c$1,
      [53, 3],
      c$1,
      [85, 4],
      c$1,
      [35, 3],
      0
    ])
    }),
    performAction: function parser__PerformAction(yyloc, yystate /* action[1] */, yysp, yyvstack, yylstack) {

              /* this == yyval */

              // the JS engine itself can go and remove these statements when `yy` turns out to be unused in any action code!
              var yy = this.yy;
              var yyparser = yy.parser;
              var yylexer = yy.lexer;

              switch (yystate) {
    case 0:
        /*! Production::    $accept : spec $end */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yylstack[yysp - 1];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-)
        break;

    case 1:
        /*! Production::    spec : declaration_list "%%" grammar optional_end_block EOF */

        // default action (generated by JISON mode classic/merge :: 5,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 4, yysp);
        // END of default action (generated by JISON mode classic/merge :: 5,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 4];
        if (yyvstack[yysp - 1].trim() !== '') {
            yy.addDeclaration(this.$, { include: yyvstack[yysp - 1] });
        }
        return extend(this.$, yyvstack[yysp - 2]);

    case 2:
        /*! Production::    spec : declaration_list "%%" grammar error EOF */

        // default action (generated by JISON mode classic/merge :: 5,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 4];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 4, yysp);
        // END of default action (generated by JISON mode classic/merge :: 5,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        illegal input in the parser grammar productions definition section.
    
        Maybe you did not correctly separate trailing code from the grammar rule set with a '%%' marker on an otherwise empty line?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;

    case 3:
        /*! Production::    spec : declaration_list error EOF */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        Maybe you did not correctly separate the parse 'header section' (token definitions, options, lexer spec, etc.) from the grammar rule set with a '%%' on an otherwise empty line?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2])}
    `);
        break;

    case 4:
        /*! Production::    optional_end_block : %epsilon */
    case 100:
        /*! Production::    suffix : %epsilon */
    case 116:
        /*! Production::    action : %epsilon */
    case 117:
        /*! Production::    action_body : %epsilon */
    case 132:
        /*! Production::    optional_module_code_chunk : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '';
        break;

    case 5:
        /*! Production::    optional_end_block : "%%" extra_parser_module_code */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$1`
            The extra parser module code section (a.k.a. 'epilogue') does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        this.$ = yyvstack[yysp];
        break;

    case 6:
        /*! Production::    optional_action_header_block : %epsilon */
    case 10:
        /*! Production::    declaration_list : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {};
        break;

    case 7:
        /*! Production::    optional_action_header_block : optional_action_header_block ACTION */
    case 8:
        /*! Production::    optional_action_header_block : optional_action_header_block include_macro_code */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$1`
            action header code block does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        yy.addDeclaration(this.$, { actionInclude: yyvstack[yysp] });
        break;

    case 9:
        /*! Production::    declaration_list : declaration_list declaration */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1]; yy.addDeclaration(this.$, yyvstack[yysp]);
        break;

    case 11:
        /*! Production::    declaration_list : declaration_list error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        declaration list error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 12:
        /*! Production::    declaration : START id */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {start: yyvstack[yysp]};
        break;

    case 13:
        /*! Production::    declaration : LEX_BLOCK */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {lex: {text: yyvstack[yysp], position: yylstack[yysp]}};
        break;

    case 14:
        /*! Production::    declaration : operator */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {operator: yyvstack[yysp]};
        break;

    case 15:
        /*! Production::    declaration : TOKEN full_token_definitions */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {token_list: yyvstack[yysp]};
        break;

    case 16:
        /*! Production::    declaration : ACTION */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$1`
            action code block does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        this.$ = {include: yyvstack[yysp]};
        break;

    case 17:
        /*! Production::    declaration : include_macro_code */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$1`
            action header code block does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        this.$ = {include: yyvstack[yysp]};
        break;

    case 18:
        /*! Production::    declaration : parse_params */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {parseParams: yyvstack[yysp]};
        break;

    case 19:
        /*! Production::    declaration : parser_type */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {parserType: yyvstack[yysp]};
        break;

    case 20:
        /*! Production::    declaration : options */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {options: yyvstack[yysp]};
        break;

    case 21:
        /*! Production::    declaration : DEBUG */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {options: [['debug', true]]};
        break;

    case 22:
        /*! Production::    declaration : EBNF */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        ebnf = true; 
        this.$ = {options: [['ebnf', true]]};
        break;

    case 23:
        /*! Production::    declaration : UNKNOWN_DECL */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {unknownDecl: yyvstack[yysp]};
        break;

    case 24:
        /*! Production::    declaration : IMPORT import_name import_path */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {imports: {name: yyvstack[yysp - 1], path: yyvstack[yysp]}};
        break;

    case 25:
        /*! Production::    declaration : IMPORT import_name error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        You did not specify a legal file path for the '%import' initialization code statement, which must have the format:
    
            %import qualifier_name file_path
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 26:
        /*! Production::    declaration : IMPORT error import_path */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        Each '%import'-ed initialization code section must be qualified by a name, e.g. 'required' before the import path itself:
    
            %import qualifier_name file_path
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2])}
    `);
        break;

    case 27:
        /*! Production::    declaration : INIT_CODE init_code_name action_ne */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$1`
            %code "${$init_code_name}" initialization section action code block does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
        `);
        }
        this.$ = {
            initCode: {
                qualifier: yyvstack[yysp - 1],
                include: yyvstack[yysp]
            }
        };
        break;

    case 28:
        /*! Production::    declaration : INIT_CODE error action_ne */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        Each '%code' initialization code section must be qualified by a name, e.g. 'required' before the action code itself:
    
            %code qualifier_name {action code}
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2], yylstack[yysp])}
    `);
        break;

    case 29:
        /*! Production::    declaration : START error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %start token error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 30:
        /*! Production::    declaration : TOKEN error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %token definition list error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 31:
        /*! Production::    declaration : IMPORT error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %import name or source filename missing maybe?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 32:
        /*! Production::    init_code_name : ID */
    case 33:
        /*! Production::    init_code_name : NAME */
    case 34:
        /*! Production::    init_code_name : STRING */
    case 35:
        /*! Production::    import_name : ID */
    case 36:
        /*! Production::    import_name : STRING */
    case 37:
        /*! Production::    import_path : ID */
    case 38:
        /*! Production::    import_path : STRING */
    case 67:
        /*! Production::    optional_token_type : TOKEN_TYPE */
    case 68:
        /*! Production::    token_value : INTEGER */
    case 69:
        /*! Production::    token_description : STRING */
    case 80:
        /*! Production::    optional_production_description : STRING */
    case 95:
        /*! Production::    expression : ID */
    case 101:
        /*! Production::    suffix : "*" */
    case 102:
        /*! Production::    suffix : "?" */
    case 103:
        /*! Production::    suffix : "+" */
    case 107:
        /*! Production::    symbol : id */
    case 108:
        /*! Production::    symbol : STRING */
    case 109:
        /*! Production::    id : ID */
    case 112:
        /*! Production::    action_ne : ACTION */
    case 113:
        /*! Production::    action_ne : include_macro_code */
    case 114:
        /*! Production::    action : action_ne */
    case 118:
        /*! Production::    action_body : action_comments_body */
    case 122:
        /*! Production::    action_comments_body : ACTION_BODY */
    case 124:
        /*! Production::    extra_parser_module_code : optional_module_code_chunk */
    case 128:
        /*! Production::    module_code_chunk : CODE */
    case 131:
        /*! Production::    optional_module_code_chunk : module_code_chunk */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp];
        break;

    case 39:
        /*! Production::    options : OPTIONS option_list OPTIONS_END */
    case 110:
        /*! Production::    action_ne : "{" action_body "}" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        break;

    case 40:
        /*! Production::    options : OPTIONS error OPTIONS_END */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %options ill defined / error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2], yylstack[yysp])}
    `);
        break;

    case 41:
        /*! Production::    options : OPTIONS error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %options don't seem terminated?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 42:
        /*! Production::    option_list : option_list option */
    case 59:
        /*! Production::    token_list : token_list symbol */
    case 70:
        /*! Production::    id_list : id_list id */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1]; this.$.push(yyvstack[yysp]);
        break;

    case 43:
        /*! Production::    option_list : option */
    case 60:
        /*! Production::    token_list : symbol */
    case 71:
        /*! Production::    id_list : id */
    case 83:
        /*! Production::    handle_list : handle_action */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp]];
        break;

    case 44:
        /*! Production::    option : NAME */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp], true];
        break;

    case 45:
        /*! Production::    option : NAME "=" OPTION_STRING_VALUE */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp - 2], yyvstack[yysp]];
        break;

    case 46:
        /*! Production::    option : NAME "=" OPTION_VALUE */
    case 47:
        /*! Production::    option : NAME "=" NAME */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp - 2], parseValue(yyvstack[yysp])];
        break;

    case 48:
        /*! Production::    option : NAME "=" error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        named %option value error for ${yyvstack[yysp - 2]}?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 49:
        /*! Production::    option : NAME error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        named %option value assignment error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 50:
        /*! Production::    parse_params : PARSE_PARAM token_list */
    case 52:
        /*! Production::    parser_type : PARSER_TYPE symbol */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp];
        break;

    case 51:
        /*! Production::    parse_params : PARSE_PARAM error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %parse-params declaration error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 53:
        /*! Production::    parser_type : PARSER_TYPE error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %parser-type declaration error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 54:
        /*! Production::    operator : associativity token_list */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp - 1]]; this.$.push.apply(this.$, yyvstack[yysp]);
        break;

    case 55:
        /*! Production::    operator : associativity error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        operator token list error in an associativity statement?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 56:
        /*! Production::    associativity : LEFT */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = 'left';
        break;

    case 57:
        /*! Production::    associativity : RIGHT */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = 'right';
        break;

    case 58:
        /*! Production::    associativity : NONASSOC */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = 'nonassoc';
        break;

    case 61:
        /*! Production::    full_token_definitions : optional_token_type id_list */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = [];
        var lst = yyvstack[yysp];
        for (var i = 0, len = lst.length; i < len; i++) {
            var id = lst[i];
            var m = {id: id};
            if (yyvstack[yysp - 1]) {
                m.type = yyvstack[yysp - 1];
            }
            rv.push(m);
        }
        this.$ = rv;
        break;

    case 62:
        /*! Production::    full_token_definitions : optional_token_type one_full_token */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        var m = yyvstack[yysp];
        if (yyvstack[yysp - 1]) {
            m.type = yyvstack[yysp - 1];
        }
        this.$ = [m];
        break;

    case 63:
        /*! Production::    one_full_token : id token_value token_description */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {
            id: yyvstack[yysp - 2],
            value: yyvstack[yysp - 1],
            description: yyvstack[yysp]
        };
        break;

    case 64:
        /*! Production::    one_full_token : id token_description */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {
            id: yyvstack[yysp - 1],
            description: yyvstack[yysp]
        };
        break;

    case 65:
        /*! Production::    one_full_token : id token_value */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {
            id: yyvstack[yysp - 1],
            value: yyvstack[yysp]
        };
        break;

    case 66:
        /*! Production::    optional_token_type : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = false;
        break;

    case 72:
        /*! Production::    grammar : optional_action_header_block production_list */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        this.$.grammar = yyvstack[yysp];
        break;

    case 73:
        /*! Production::    production_list : production_list production */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        if (yyvstack[yysp][0] in this.$) {
            this.$[yyvstack[yysp][0]] = this.$[yyvstack[yysp][0]].concat(yyvstack[yysp][1]);
        } else {
            this.$[yyvstack[yysp][0]] = yyvstack[yysp][1];
        }
        break;

    case 74:
        /*! Production::    production_list : production */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {}; this.$[yyvstack[yysp][0]] = yyvstack[yysp][1];
        break;

    case 75:
        /*! Production::    production : production_id handle_list ";" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp - 2], yyvstack[yysp - 1]];
        break;

    case 76:
        /*! Production::    production : production_id error ";" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        rule production declaration error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;

    case 77:
        /*! Production::    production : production_id error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        rule production declaration error: did you terminate the rule production set with a semicolon?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 78:
        /*! Production::    production_id : id optional_production_description ":" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2];
        
        // TODO: carry rule description support into the parser generator...
        break;

    case 79:
        /*! Production::    production_id : id optional_production_description error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        rule id should be followed by a colon, but that one seems missing?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 81:
        /*! Production::    optional_production_description : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,-,-,LT,LA,-,-):
        this.$ = undefined;
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,-,-,LT,LA,-,-)
        break;

    case 82:
        /*! Production::    handle_list : handle_list "|" handle_action */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2];
        this.$.push(yyvstack[yysp]);
        break;

    case 84:
        /*! Production::    handle_list : handle_list "|" error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        rule alternative production declaration error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 85:
        /*! Production::    handle_list : handle_list ":" error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        multiple alternative rule productions should be separated by a '|' pipe character, not a ':' colon!
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 86:
        /*! Production::    handle_action : handle prec action */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [(yyvstack[yysp - 2].length ? yyvstack[yysp - 2].join(' ') : '')];
        if (yyvstack[yysp]) {
            var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
            if (rv) {
                yyparser.yyError(rmCommonWS$1`
                production rule action code block does not compile: ${rv}
    
                  Erroneous area:
                ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
            `);
            }
            this.$.push(yyvstack[yysp]);
        }
        if (yyvstack[yysp - 1]) {
            if (yyvstack[yysp - 2].length === 0) {
                yyparser.yyError(rmCommonWS$1`
                You cannot specify a precedence override for an epsilon (a.k.a. empty) rule!
    
                  Erroneous area:
                ${yylexer.prettyPrintRange(yylstack[yysp - 2], yylstack[yysp - 3], yylstack[yysp] /* @handle is very probably NULL! We need this one for some decent location info! */)}
            `);
            }
            this.$.push(yyvstack[yysp - 1]);
        }
        if (this.$.length === 1) {
            this.$ = this.$[0];
        }
        break;

    case 87:
        /*! Production::    handle_action : EPSILON action */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [''];
        if (yyvstack[yysp]) {
            var rv = checkActionBlock$1(yyvstack[yysp], yylstack[yysp]);
            if (rv) {
                yyparser.yyError(rmCommonWS$1`
                epsilon production rule action code block does not compile: ${rv}
    
                  Erroneous area:
                ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
            `);
            }
            this.$.push(yyvstack[yysp]);
        }
        if (this.$.length === 1) {
            this.$ = this.$[0];
        }
        break;

    case 88:
        /*! Production::    handle_action : EPSILON error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %epsilon rule action declaration error?
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 89:
        /*! Production::    handle : handle suffixed_expression */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        this.$.push(yyvstack[yysp]);
        break;

    case 90:
        /*! Production::    handle : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [];
        break;

    case 91:
        /*! Production::    handle_sublist : handle_sublist "|" handle */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2];
        this.$.push(yyvstack[yysp].join(' '));
        break;

    case 92:
        /*! Production::    handle_sublist : handle */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp].join(' ')];
        break;

    case 93:
        /*! Production::    suffixed_expression : expression suffix ALIAS */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2] + yyvstack[yysp - 1] + "[" + yyvstack[yysp] + "]";
        break;

    case 94:
        /*! Production::    suffixed_expression : expression suffix */
    case 123:
        /*! Production::    action_comments_body : action_comments_body ACTION_BODY */
    case 129:
        /*! Production::    module_code_chunk : module_code_chunk CODE */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 96:
        /*! Production::    expression : EOF_ID */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '$end';
        break;

    case 97:
        /*! Production::    expression : STRING */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        // Re-encode the string *anyway* as it will
        // be made part of the rule rhs a.k.a. production (type: *string*) again and we want
        // to be able to handle all tokens, including *significant space*
        // encoded as literal tokens in a grammar such as this: `rule: A ' ' B`.
        this.$ = dquote$1(yyvstack[yysp]);
        break;

    case 98:
        /*! Production::    expression : "(" handle_sublist ")" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '(' + yyvstack[yysp - 1].join(' | ') + ')';
        break;

    case 99:
        /*! Production::    expression : "(" handle_sublist error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        Seems you did not correctly bracket a grammar rule sublist in '( ... )' brackets.
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 104:
        /*! Production::    prec : PREC symbol */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = { prec: yyvstack[yysp] };
        break;

    case 105:
        /*! Production::    prec : PREC error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        %prec precedence override declaration error?
    
          Erroneous precedence declaration:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 106:
        /*! Production::    prec : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = null;
        break;

    case 111:
        /*! Production::    action_ne : "{" action_body error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        Seems you did not correctly bracket a parser rule action block in curly braces: '{ ... }'.
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 115:
        /*! Production::    action : ARROW_ACTION */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '$$ = (' + yyvstack[yysp] + ');';
        break;

    case 119:
        /*! Production::    action_body : action_body "{" action_body "}" action_comments_body */

        // default action (generated by JISON mode classic/merge :: 5,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 4, yysp);
        // END of default action (generated by JISON mode classic/merge :: 5,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 4] + yyvstack[yysp - 3] + yyvstack[yysp - 2] + yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 120:
        /*! Production::    action_body : action_body "{" action_body "}" */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 3] + yyvstack[yysp - 2] + yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 121:
        /*! Production::    action_body : action_body "{" action_body error */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 3];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
        Seems you did not correctly match curly braces '{ ... }' in a parser rule action block.
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 125:
        /*! Production::    extra_parser_module_code : optional_module_code_chunk include_macro_code extra_parser_module_code */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2] + yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 126:
        /*! Production::    include_macro_code : INCLUDE PATH */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        var fileContent = fs__default['default'].readFileSync(yyvstack[yysp], { encoding: 'utf-8' });
        var rv = checkActionBlock$1(fileContent);
        if (rv) {
            yyparser.yyError(rmCommonWS$1`
            included action code file "${$PATH}" does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
        `);
        }
        // And no, we don't support nested '%include':
        this.$ = '\n// Included by Jison: ' + yyvstack[yysp] + ':\n\n' + fileContent + '\n\n// End Of Include by Jison: ' + yyvstack[yysp] + '\n\n';
        break;

    case 127:
        /*! Production::    include_macro_code : INCLUDE error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$1`
    %include MUST be followed by a valid file path.
    
      Erroneous path:
    ` + yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1]));
        break;

    case 130:
        /*! Production::    module_code_chunk : error */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp];
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$1`
        module code declaration error?
    
          Erroneous area:
        ` + yylexer.prettyPrintRange(yylstack[yysp]));
        break;
                
    }
    },
    table: bt$1({
      len: u$1([
      20,
      1,
      25,
      5,
      19,
      18,
      3,
      18,
      18,
      5,
      s$1,
      [18, 8],
      4,
      5,
      6,
      2,
      s$1,
      [6, 4, -1],
      3,
      3,
      4,
      8,
      1,
      18,
      18,
      26,
      c$1,
      [18, 3],
      1,
      4,
      21,
      3,
      3,
      5,
      5,
      s$1,
      [3, 3],
      22,
      18,
      20,
      25,
      25,
      24,
      24,
      22,
      s$1,
      [18, 3],
      3,
      19,
      2,
      4,
      1,
      1,
      7,
      7,
      c$1,
      [40, 3],
      17,
      4,
      20,
      18,
      23,
      s$1,
      [18, 6],
      6,
      21,
      21,
      18,
      20,
      18,
      2,
      18,
      4,
      2,
      s$1,
      [1, 3],
      s$1,
      [3, 4],
      4,
      3,
      5,
      3,
      15,
      11,
      2,
      2,
      19,
      20,
      18,
      c$1,
      [104, 3],
      4,
      4,
      s$1,
      [2, 4],
      7,
      3,
      4,
      16,
      1,
      4,
      10,
      14,
      c$1,
      [122, 3],
      18,
      18,
      9,
      s$1,
      [3, 4],
      14,
      14,
      18,
      21,
      21,
      6,
      4,
      c$1,
      [50, 5],
      7,
      7,
      s$1,
      [15, 4],
      3,
      9,
      3,
      14,
      18,
      18,
      8,
      5,
      3,
      9,
      4
    ]),
      symbol: u$1([
      2,
      s$1,
      [14, 10, 1],
      27,
      s$1,
      [31, 5, 1],
      44,
      47,
      50,
      1,
      c$1,
      [21, 18],
      51,
      55,
      s$1,
      [58, 4, 1],
      89,
      15,
      24,
      44,
      49,
      69,
      c$1,
      [31, 19],
      c$1,
      [18, 19],
      24,
      83,
      c$1,
      [39, 38],
      36,
      63,
      65,
      c$1,
      [41, 37],
      c$1,
      [18, 108],
      24,
      26,
      53,
      2,
      24,
      25,
      26,
      52,
      c$1,
      [9, 3],
      62,
      82,
      83,
      2,
      45,
      c$1,
      [8, 7],
      24,
      26,
      c$1,
      [5, 3],
      25,
      56,
      57,
      c$1,
      [9, 3],
      c$1,
      [3, 6],
      c$1,
      [266, 3],
      48,
      c$1,
      [275, 3],
      70,
      71,
      72,
      83,
      89,
      c$1,
      [278, 38],
      4,
      5,
      6,
      12,
      s$1,
      [14, 11, 1],
      26,
      c$1,
      [24, 6],
      37,
      42,
      c$1,
      [152, 37],
      24,
      64,
      68,
      83,
      24,
      c$1,
      [119, 3],
      54,
      c$1,
      [27, 11],
      c$1,
      [67, 8],
      44,
      54,
      c$1,
      [147, 6],
      12,
      15,
      44,
      84,
      89,
      c$1,
      [5, 8],
      c$1,
      [3, 6],
      c$1,
      [46, 20],
      c$1,
      [201, 3],
      c$1,
      [113, 28],
      c$1,
      [40, 9],
      c$1,
      [177, 23],
      c$1,
      [176, 3],
      c$1,
      [25, 24],
      1,
      c$1,
      [26, 4],
      c$1,
      [25, 11],
      c$1,
      [73, 7],
      46,
      c$1,
      [24, 24],
      c$1,
      [158, 51],
      c$1,
      [18, 25],
      25,
      28,
      57,
      c$1,
      [21, 12],
      28,
      c$1,
      [22, 8],
      2,
      3,
      25,
      28,
      s$1,
      [1, 3],
      2,
      44,
      46,
      88,
      90,
      91,
      c$1,
      [425, 3],
      24,
      c$1,
      [433, 3],
      c$1,
      [440, 3],
      c$1,
      [3, 3],
      c$1,
      [13, 4],
      c$1,
      [153, 4],
      7,
      12,
      15,
      24,
      26,
      38,
      40,
      41,
      42,
      44,
      74,
      75,
      76,
      2,
      5,
      26,
      73,
      c$1,
      [151, 12],
      c$1,
      [94, 7],
      c$1,
      [307, 38],
      37,
      44,
      66,
      67,
      c$1,
      [685, 109],
      12,
      13,
      43,
      86,
      87,
      c$1,
      [349, 14],
      c$1,
      [445, 11],
      c$1,
      [84, 46],
      c$1,
      [504, 10],
      c$1,
      [348, 19],
      c$1,
      [58, 19],
      25,
      29,
      30,
      c$1,
      [346, 5],
      1,
      44,
      89,
      1,
      c$1,
      [483, 3],
      c$1,
      [3, 6],
      c$1,
      [339, 3],
      c$1,
      [121, 3],
      c$1,
      [496, 3],
      c$1,
      [8, 5],
      c$1,
      [349, 8],
      c$1,
      [348, 4],
      78,
      79,
      81,
      c$1,
      [568, 5],
      15,
      42,
      44,
      84,
      85,
      89,
      2,
      5,
      2,
      5,
      c$1,
      [359, 19],
      c$1,
      [19, 11],
      c$1,
      [142, 8],
      c$1,
      [337, 30],
      c$1,
      [180, 26],
      c$1,
      [284, 3],
      c$1,
      [287, 4],
      c$1,
      [4, 4],
      25,
      28,
      25,
      28,
      c$1,
      [4, 4],
      c$1,
      [517, 8],
      c$1,
      [168, 6],
      c$1,
      [507, 14],
      c$1,
      [506, 3],
      c$1,
      [189, 7],
      c$1,
      [162, 8],
      s$1,
      [4, 5, 1],
      c$1,
      [190, 8],
      c$1,
      [1024, 6],
      s$1,
      [4, 9, 1],
      c$1,
      [22, 3],
      s$1,
      [39, 4, 1],
      44,
      80,
      c$1,
      [19, 18],
      c$1,
      [18, 37],
      c$1,
      [16, 3],
      c$1,
      [88, 3],
      76,
      77,
      c$1,
      [292, 6],
      c$1,
      [3, 6],
      c$1,
      [144, 14],
      c$1,
      [14, 15],
      c$1,
      [480, 39],
      c$1,
      [21, 21],
      c$1,
      [549, 6],
      c$1,
      [6, 3],
      1,
      c$1,
      [111, 12],
      c$1,
      [234, 7],
      c$1,
      [7, 7],
      c$1,
      [238, 10],
      c$1,
      [179, 11],
      c$1,
      [15, 40],
      6,
      8,
      c$1,
      [209, 7],
      78,
      79,
      c$1,
      [374, 4],
      c$1,
      [313, 14],
      c$1,
      [271, 43],
      c$1,
      [164, 4],
      c$1,
      [169, 4],
      c$1,
      [78, 12],
      43
    ]),
      type: u$1([
      s$1,
      [2, 18],
      0,
      0,
      1,
      c$1,
      [21, 20],
      s$1,
      [0, 5],
      c$1,
      [10, 5],
      s$1,
      [2, 39],
      c$1,
      [40, 41],
      c$1,
      [41, 40],
      s$1,
      [2, 108],
      c$1,
      [148, 5],
      c$1,
      [239, 6],
      c$1,
      [159, 6],
      c$1,
      [253, 10],
      c$1,
      [176, 14],
      c$1,
      [36, 7],
      c$1,
      [197, 102],
      c$1,
      [103, 7],
      c$1,
      [108, 21],
      c$1,
      [21, 10],
      c$1,
      [423, 36],
      c$1,
      [373, 149],
      c$1,
      [158, 67],
      c$1,
      [57, 32],
      c$1,
      [322, 8],
      c$1,
      [98, 26],
      c$1,
      [489, 7],
      c$1,
      [721, 173],
      c$1,
      [462, 131],
      c$1,
      [130, 37],
      c$1,
      [375, 11],
      c$1,
      [818, 45],
      c$1,
      [223, 79],
      c$1,
      [124, 24],
      c$1,
      [986, 15],
      c$1,
      [38, 19],
      c$1,
      [57, 20],
      c$1,
      [157, 62],
      c$1,
      [443, 106],
      c$1,
      [106, 103],
      c$1,
      [103, 62],
      c$1,
      [1248, 16],
      c$1,
      [78, 6]
    ]),
      state: u$1([
      1,
      2,
      5,
      14,
      12,
      13,
      8,
      20,
      11,
      29,
      28,
      31,
      34,
      36,
      38,
      42,
      47,
      49,
      50,
      54,
      49,
      50,
      56,
      50,
      58,
      60,
      62,
      65,
      68,
      69,
      70,
      67,
      72,
      71,
      73,
      74,
      78,
      79,
      82,
      83,
      82,
      84,
      50,
      84,
      50,
      86,
      92,
      94,
      93,
      97,
      69,
      70,
      98,
      100,
      101,
      103,
      105,
      106,
      107,
      110,
      111,
      117,
      124,
      126,
      123,
      133,
      131,
      82,
      137,
      142,
      94,
      93,
      143,
      101,
      133,
      146,
      82,
      147,
      50,
      149,
      154,
      153,
      155,
      111,
      124,
      126,
      162,
      163,
      124,
      126
    ]),
      mode: u$1([
      s$1,
      [2, 18],
      s$1,
      [1, 18],
      c$1,
      [21, 4],
      s$1,
      [2, 36],
      c$1,
      [42, 5],
      c$1,
      [38, 34],
      c$1,
      [77, 38],
      s$1,
      [2, 108],
      s$1,
      [1, 20],
      c$1,
      [30, 15],
      c$1,
      [134, 100],
      c$1,
      [106, 4],
      c$1,
      [335, 26],
      c$1,
      [151, 16],
      c$1,
      [376, 48],
      c$1,
      [347, 120],
      c$1,
      [63, 75],
      c$1,
      [13, 9],
      c$1,
      [23, 4],
      c$1,
      [4, 3],
      c$1,
      [587, 6],
      c$1,
      [427, 12],
      c$1,
      [9, 15],
      c$1,
      [335, 13],
      c$1,
      [389, 39],
      c$1,
      [45, 43],
      c$1,
      [509, 77],
      c$1,
      [762, 121],
      c$1,
      [129, 9],
      c$1,
      [756, 14],
      c$1,
      [334, 14],
      c$1,
      [41, 6],
      c$1,
      [367, 5],
      c$1,
      [784, 37],
      c$1,
      [208, 63],
      c$1,
      [1142, 20],
      c$1,
      [1081, 10],
      c$1,
      [487, 14],
      c$1,
      [22, 9],
      c$1,
      [151, 17],
      c$1,
      [221, 10],
      c$1,
      [803, 156],
      c$1,
      [318, 61],
      c$1,
      [216, 50],
      c$1,
      [457, 7],
      c$1,
      [455, 38],
      c$1,
      [123, 34],
      c$1,
      [1206, 8],
      1
    ]),
      goto: u$1([
      s$1,
      [10, 18],
      4,
      3,
      10,
      6,
      7,
      9,
      s$1,
      [15, 5, 1],
      24,
      22,
      23,
      25,
      26,
      27,
      21,
      s$1,
      [6, 3],
      30,
      s$1,
      [11, 18],
      s$1,
      [9, 18],
      32,
      33,
      s$1,
      [13, 18],
      s$1,
      [14, 18],
      35,
      66,
      37,
      s$1,
      [16, 18],
      s$1,
      [17, 18],
      s$1,
      [18, 18],
      s$1,
      [19, 18],
      s$1,
      [20, 18],
      s$1,
      [21, 18],
      s$1,
      [22, 18],
      s$1,
      [23, 18],
      39,
      40,
      41,
      s$1,
      [43, 4, 1],
      48,
      33,
      51,
      53,
      52,
      55,
      33,
      51,
      57,
      33,
      51,
      59,
      61,
      s$1,
      [56, 3],
      s$1,
      [57, 3],
      s$1,
      [58, 3],
      4,
      63,
      64,
      66,
      33,
      21,
      3,
      s$1,
      [12, 18],
      s$1,
      [29, 18],
      s$1,
      [109, 26],
      s$1,
      [15, 18],
      s$1,
      [30, 18],
      33,
      67,
      75,
      76,
      77,
      s$1,
      [31, 11],
      c$1,
      [13, 9],
      s$1,
      [35, 3],
      s$1,
      [36, 3],
      80,
      81,
      21,
      c$1,
      [3, 3],
      s$1,
      [32, 3],
      s$1,
      [33, 3],
      s$1,
      [34, 3],
      s$1,
      [54, 11],
      33,
      51,
      s$1,
      [54, 7],
      s$1,
      [55, 18],
      s$1,
      [60, 20],
      s$1,
      [107, 25],
      s$1,
      [108, 25],
      s$1,
      [126, 24],
      s$1,
      [127, 24],
      s$1,
      [50, 11],
      33,
      51,
      s$1,
      [50, 7],
      s$1,
      [51, 18],
      s$1,
      [52, 18],
      s$1,
      [53, 18],
      61,
      85,
      s$1,
      [41, 12],
      87,
      s$1,
      [41, 6],
      43,
      43,
      89,
      88,
      44,
      44,
      90,
      91,
      132,
      96,
      132,
      95,
      s$1,
      [72, 3],
      33,
      s$1,
      [7, 3],
      s$1,
      [8, 3],
      s$1,
      [74, 4],
      99,
      s$1,
      [90, 8],
      102,
      s$1,
      [90, 4],
      81,
      81,
      104,
      s$1,
      [61, 11],
      33,
      s$1,
      [61, 7],
      s$1,
      [62, 18],
      s$1,
      [71, 12],
      109,
      s$1,
      [71, 6],
      108,
      71,
      s$1,
      [24, 18],
      s$1,
      [25, 18],
      s$1,
      [37, 18],
      s$1,
      [38, 18],
      s$1,
      [26, 18],
      s$1,
      [27, 18],
      s$1,
      [117, 3],
      s$1,
      [112, 22],
      s$1,
      [113, 21],
      s$1,
      [28, 18],
      s$1,
      [59, 20],
      s$1,
      [39, 18],
      42,
      42,
      s$1,
      [40, 18],
      116,
      115,
      113,
      114,
      49,
      49,
      1,
      2,
      5,
      124,
      21,
      131,
      131,
      118,
      s$1,
      [128, 3],
      s$1,
      [130, 3],
      s$1,
      [73, 4],
      119,
      121,
      120,
      77,
      77,
      122,
      77,
      77,
      s$1,
      [83, 3],
      s$1,
      [106, 3],
      130,
      106,
      106,
      127,
      129,
      128,
      125,
      106,
      106,
      132,
      s$1,
      [116, 3],
      80,
      81,
      134,
      21,
      136,
      135,
      80,
      80,
      s$1,
      [70, 19],
      s$1,
      [65, 11],
      109,
      s$1,
      [65, 7],
      s$1,
      [64, 18],
      s$1,
      [68, 19],
      s$1,
      [69, 18],
      139,
      140,
      138,
      s$1,
      [118, 3],
      141,
      s$1,
      [122, 4],
      45,
      45,
      46,
      46,
      47,
      47,
      48,
      48,
      c$1,
      [494, 4],
      s$1,
      [129, 3],
      s$1,
      [75, 4],
      144,
      c$1,
      [487, 13],
      145,
      s$1,
      [76, 4],
      c$1,
      [153, 7],
      s$1,
      [89, 14],
      148,
      33,
      51,
      s$1,
      [100, 6],
      150,
      151,
      152,
      s$1,
      [100, 9],
      s$1,
      [95, 18],
      s$1,
      [96, 18],
      s$1,
      [97, 18],
      s$1,
      [90, 7],
      s$1,
      [87, 3],
      s$1,
      [88, 3],
      s$1,
      [114, 3],
      s$1,
      [115, 3],
      s$1,
      [78, 14],
      s$1,
      [79, 14],
      s$1,
      [63, 18],
      s$1,
      [110, 21],
      s$1,
      [111, 21],
      c$1,
      [526, 4],
      s$1,
      [123, 4],
      125,
      s$1,
      [82, 3],
      s$1,
      [84, 3],
      s$1,
      [85, 3],
      s$1,
      [86, 3],
      s$1,
      [104, 7],
      s$1,
      [105, 7],
      s$1,
      [94, 10],
      156,
      s$1,
      [94, 4],
      s$1,
      [101, 15],
      s$1,
      [102, 15],
      s$1,
      [103, 15],
      158,
      159,
      157,
      92,
      92,
      130,
      92,
      c$1,
      [465, 3],
      161,
      140,
      160,
      s$1,
      [93, 14],
      s$1,
      [98, 18],
      s$1,
      [99, 18],
      s$1,
      [90, 7],
      s$1,
      [120, 3],
      112,
      s$1,
      [121, 3],
      91,
      91,
      130,
      91,
      c$1,
      [74, 3],
      s$1,
      [119, 3],
      141
    ])
    }),
    defaultActions: bda({
      idx: u$1([
      0,
      3,
      5,
      7,
      8,
      s$1,
      [10, 8, 1],
      25,
      26,
      27,
      s$1,
      [30, 6, 1],
      37,
      40,
      41,
      44,
      45,
      46,
      s$1,
      [48, 6, 1],
      55,
      56,
      57,
      60,
      66,
      67,
      68,
      72,
      s$1,
      [74, 6, 1],
      s$1,
      [81, 7, 1],
      s$1,
      [89, 4, 1],
      95,
      96,
      97,
      100,
      104,
      105,
      107,
      108,
      109,
      s$1,
      [112, 5, 1],
      118,
      119,
      122,
      124,
      s$1,
      [127, 13, 1],
      s$1,
      [141, 8, 1],
      150,
      151,
      152,
      s$1,
      [156, 4, 1],
      161
    ]),
      goto: u$1([
      10,
      6,
      9,
      13,
      14,
      s$1,
      [16, 8, 1],
      56,
      57,
      58,
      3,
      12,
      29,
      109,
      15,
      30,
      67,
      35,
      36,
      32,
      33,
      34,
      55,
      60,
      107,
      108,
      126,
      127,
      51,
      52,
      53,
      43,
      7,
      8,
      74,
      62,
      24,
      25,
      37,
      38,
      26,
      27,
      112,
      113,
      28,
      59,
      39,
      42,
      40,
      49,
      1,
      2,
      5,
      128,
      130,
      73,
      83,
      80,
      70,
      64,
      68,
      69,
      122,
      s$1,
      [45, 4, 1],
      129,
      75,
      76,
      89,
      95,
      96,
      97,
      90,
      87,
      88,
      114,
      115,
      78,
      79,
      63,
      110,
      111,
      123,
      125,
      82,
      84,
      85,
      86,
      104,
      105,
      101,
      102,
      103,
      93,
      98,
      99,
      90,
      121
    ])
    }),
    parseError: function parseError(str, hash, ExceptionClass) {

        if (hash.recoverable) {
            if (typeof this.trace === 'function') {
                this.trace(str);
            }
            hash.destroy();             // destroy... well, *almost*!
        } else {
            if (typeof this.trace === 'function') {
                this.trace(str);
            }
            if (!ExceptionClass) {
                ExceptionClass = this.JisonParserError;
            }
            throw new ExceptionClass(str, hash);
        }
    },
    parse: function parse(input) {
        var self = this;
        var stack = new Array(128);         // token stack: stores token which leads to state at the same index (column storage)
        var sstack = new Array(128);        // state stack: stores states (column storage)

        var vstack = new Array(128);        // semantic value stack
        var lstack = new Array(128);        // location stack
        var table = this.table;
        var sp = 0;                         // 'stack pointer': index into the stacks
        var yyloc;

        


        var symbol = 0;
        var preErrorSymbol = 0;
        var lastEofErrorStateDepth = Infinity;
        var recoveringErrorInfo = null;
        var recovering = 0;                 // (only used when the grammar contains error recovery rules)
        var TERROR = this.TERROR;
        var EOF = this.EOF;
        var ERROR_RECOVERY_TOKEN_DISCARD_COUNT = (this.options.errorRecoveryTokenDiscardCount | 0) || 3;
        var NO_ACTION = [0, 164 /* === table.length :: ensures that anyone using this new state will fail dramatically! */];

        var lexer;
        if (this.__lexer__) {
            lexer = this.__lexer__;
        } else {
            lexer = this.__lexer__ = Object.create(this.lexer);
        }

        var sharedState_yy = {
            parseError: undefined,
            quoteName: undefined,
            lexer: undefined,
            parser: undefined,
            pre_parse: undefined,
            post_parse: undefined,
            pre_lex: undefined,
            post_lex: undefined      // WARNING: must be written this way for the code expanders to work correctly in both ES5 and ES6 modes!
        };

        var ASSERT;
        if (typeof assert !== 'function') {
            ASSERT = function JisonAssert(cond, msg) {
                if (!cond) {
                    throw new Error('assertion failed: ' + (msg || '***'));
                }
            };
        } else {
            ASSERT = assert;
        }

        this.yyGetSharedState = function yyGetSharedState() {
            return sharedState_yy;
        };


        this.yyGetErrorInfoTrack = function yyGetErrorInfoTrack() {
            return recoveringErrorInfo;
        };


        // shallow clone objects, straight copy of simple `src` values
        // e.g. `lexer.yytext` MAY be a complex value object,
        // rather than a simple string/value.
        function shallow_copy(src) {
            if (typeof src === 'object') {
                var dst = {};
                for (var k in src) {
                    if (Object.prototype.hasOwnProperty.call(src, k)) {
                        dst[k] = src[k];
                    }
                }
                return dst;
            }
            return src;
        }
        function shallow_copy_noclobber(dst, src) {
            for (var k in src) {
                if (typeof dst[k] === 'undefined' && Object.prototype.hasOwnProperty.call(src, k)) {
                    dst[k] = src[k];
                }
            }
        }
        function copy_yylloc(loc) {
            var rv = shallow_copy(loc);
            if (rv && rv.range) {
                rv.range = rv.range.slice(0);
            }
            return rv;
        }

        // copy state
        shallow_copy_noclobber(sharedState_yy, this.yy);

        sharedState_yy.lexer = lexer;
        sharedState_yy.parser = this;





        // *Always* setup `yyError`, `YYRECOVERING`, `yyErrOk` and `yyClearIn` functions as it is paramount
        // to have *their* closure match ours -- if we only set them up once,
        // any subsequent `parse()` runs will fail in very obscure ways when
        // these functions are invoked in the user action code block(s) as
        // their closure will still refer to the `parse()` instance which set
        // them up. Hence we MUST set them up at the start of every `parse()` run!
        if (this.yyError) {
            this.yyError = function yyError(str /*, ...args */) {











                var error_rule_depth = (this.options.parserErrorsAreRecoverable ? locateNearestErrorRecoveryRule(state) : -1);
                var expected = this.collect_expected_token_set(state);
                var hash = this.constructParseErrorInfo(str, null, expected, (error_rule_depth >= 0));
                // append to the old one?
                if (recoveringErrorInfo) {
                    var esp = recoveringErrorInfo.info_stack_pointer;

                    recoveringErrorInfo.symbol_stack[esp] = symbol;
                    var v = this.shallowCopyErrorInfo(hash);
                    v.yyError = true;
                    v.errorRuleDepth = error_rule_depth;
                    v.recovering = recovering;
                    // v.stackSampleLength = error_rule_depth + EXTRA_STACK_SAMPLE_DEPTH;

                    recoveringErrorInfo.value_stack[esp] = v;
                    recoveringErrorInfo.location_stack[esp] = copy_yylloc(lexer.yylloc);
                    recoveringErrorInfo.state_stack[esp] = newState || NO_ACTION[1];

                    ++esp;
                    recoveringErrorInfo.info_stack_pointer = esp;
                } else {
                    recoveringErrorInfo = this.shallowCopyErrorInfo(hash);
                    recoveringErrorInfo.yyError = true;
                    recoveringErrorInfo.errorRuleDepth = error_rule_depth;
                    recoveringErrorInfo.recovering = recovering;
                }


                // Add any extra args to the hash under the name `extra_error_attributes`:
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length) {
                    hash.extra_error_attributes = args;
                }

                return this.parseError(str, hash, this.JisonParserError);
            };
        }







        // Does the shared state override the default `parseError` that already comes with this instance?
        if (typeof sharedState_yy.parseError === 'function') {
            this.parseError = function parseErrorAlt(str, hash, ExceptionClass) {
                if (!ExceptionClass) {
                    ExceptionClass = this.JisonParserError;
                }
                return sharedState_yy.parseError.call(this, str, hash, ExceptionClass);
            };
        } else {
            this.parseError = this.originalParseError;
        }

        // Does the shared state override the default `quoteName` that already comes with this instance?
        if (typeof sharedState_yy.quoteName === 'function') {
            this.quoteName = function quoteNameAlt(id_str) {
                return sharedState_yy.quoteName.call(this, id_str);
            };
        } else {
            this.quoteName = this.originalQuoteName;
        }

        // set up the cleanup function; make it an API so that external code can re-use this one in case of
        // calamities or when the `%options no-try-catch` option has been specified for the grammar, in which
        // case this parse() API method doesn't come with a `finally { ... }` block any more!
        //
        // NOTE: as this API uses parse() as a closure, it MUST be set again on every parse() invocation,
        //       or else your `sharedState`, etc. references will be *wrong*!
        this.cleanupAfterParse = function parser_cleanupAfterParse(resultValue, invoke_post_methods, do_not_nuke_errorinfos) {
            var rv;

            if (invoke_post_methods) {
                var hash;

                if (sharedState_yy.post_parse || this.post_parse) {
                    // create an error hash info instance: we re-use this API in a **non-error situation**
                    // as this one delivers all parser internals ready for access by userland code.
                    hash = this.constructParseErrorInfo(null /* no error! */, null /* no exception! */, null, false);
                }

                if (sharedState_yy.post_parse) {
                    rv = sharedState_yy.post_parse.call(this, sharedState_yy, resultValue, hash);
                    if (typeof rv !== 'undefined') resultValue = rv;
                }
                if (this.post_parse) {
                    rv = this.post_parse.call(this, sharedState_yy, resultValue, hash);
                    if (typeof rv !== 'undefined') resultValue = rv;
                }

                // cleanup:
                if (hash && hash.destroy) {
                    hash.destroy();
                }
            }

            if (this.__reentrant_call_depth > 1) return resultValue;        // do not (yet) kill the sharedState when this is a reentrant run.

            // clean up the lingering lexer structures as well:
            if (lexer.cleanupAfterLex) {
                lexer.cleanupAfterLex(do_not_nuke_errorinfos);
            }

            // prevent lingering circular references from causing memory leaks:
            if (sharedState_yy) {
                sharedState_yy.lexer = undefined;
                sharedState_yy.parser = undefined;
                if (lexer.yy === sharedState_yy) {
                    lexer.yy = undefined;
                }
            }
            sharedState_yy = undefined;
            this.parseError = this.originalParseError;
            this.quoteName = this.originalQuoteName;

            // nuke the vstack[] array at least as that one will still reference obsoleted user values.
            // To be safe, we nuke the other internal stack columns as well...
            stack.length = 0;               // fastest way to nuke an array without overly bothering the GC
            sstack.length = 0;
            lstack.length = 0;
            vstack.length = 0;
            sp = 0;

            // nuke the error hash info instances created during this run.
            // Userland code must COPY any data/references
            // in the error hash instance(s) it is more permanently interested in.
            if (!do_not_nuke_errorinfos) {
                for (var i = this.__error_infos.length - 1; i >= 0; i--) {
                    var el = this.__error_infos[i];
                    if (el && typeof el.destroy === 'function') {
                        el.destroy();
                    }
                }
                this.__error_infos.length = 0;


                for (var i = this.__error_recovery_infos.length - 1; i >= 0; i--) {
                    var el = this.__error_recovery_infos[i];
                    if (el && typeof el.destroy === 'function') {
                        el.destroy();
                    }
                }
                this.__error_recovery_infos.length = 0;

                // `recoveringErrorInfo` is also part of the `__error_recovery_infos` array,
                // hence has been destroyed already: no need to do that *twice*.
                if (recoveringErrorInfo) {
                    recoveringErrorInfo = undefined;
                }


            }

            return resultValue;
        };

        // merge yylloc info into a new yylloc instance.
        //
        // `first_index` and `last_index` MAY be UNDEFINED/NULL or these are indexes into the `lstack[]` location stack array.
        //
        // `first_yylloc` and `last_yylloc` MAY be UNDEFINED/NULL or explicit (custom or regular) `yylloc` instances, in which
        // case these override the corresponding first/last indexes.
        //
        // `dont_look_back` is an optional flag (default: FALSE), which instructs this merge operation NOT to search
        // through the parse location stack for a location, which would otherwise be used to construct the new (epsilon!)
        // yylloc info.
        //
        // Note: epsilon rule's yylloc situation is detected by passing both `first_index` and `first_yylloc` as UNDEFINED/NULL.
        this.yyMergeLocationInfo = function parser_yyMergeLocationInfo(first_index, last_index, first_yylloc, last_yylloc, dont_look_back) {
            var i1 = first_index | 0,
                i2 = last_index | 0;
            var l1 = first_yylloc,
                l2 = last_yylloc;
            var rv;

            // rules:
            // - first/last yylloc entries override first/last indexes

            if (!l1) {
                if (first_index != null) {
                    for (var i = i1; i <= i2; i++) {
                        l1 = lstack[i];
                        if (l1) {
                            break;
                        }
                    }
                }
            }

            if (!l2) {
                if (last_index != null) {
                    for (var i = i2; i >= i1; i--) {
                        l2 = lstack[i];
                        if (l2) {
                            break;
                        }
                    }
                }
            }

            // - detect if an epsilon rule is being processed and act accordingly:
            if (!l1 && first_index == null) {
                // epsilon rule span merger. With optional look-ahead in l2.
                if (!dont_look_back) {
                    for (var i = (i1 || sp) - 1; i >= 0; i--) {
                        l1 = lstack[i];
                        if (l1) {
                            break;
                        }
                    }
                }
                if (!l1) {
                    if (!l2) {
                        // when we still don't have any valid yylloc info, we're looking at an epsilon rule
                        // without look-ahead and no preceding terms and/or `dont_look_back` set:
                        // in that case we ca do nothing but return NULL/UNDEFINED:
                        return undefined;
                    } else {
                        // shallow-copy L2: after all, we MAY be looking
                        // at unconventional yylloc info objects...
                        rv = shallow_copy(l2);
                        if (rv.range) {
                            // shallow copy the yylloc ranges info to prevent us from modifying the original arguments' entries:
                            rv.range = rv.range.slice(0);
                        }
                        return rv;
                    }
                } else {
                    // shallow-copy L1, then adjust first col/row 1 column past the end.
                    rv = shallow_copy(l1);
                    rv.first_line = rv.last_line;
                    rv.first_column = rv.last_column;
                    if (rv.range) {
                        // shallow copy the yylloc ranges info to prevent us from modifying the original arguments' entries:
                        rv.range = rv.range.slice(0);
                        rv.range[0] = rv.range[1];
                    }

                    if (l2) {
                        // shallow-mixin L2, then adjust last col/row accordingly.
                        shallow_copy_noclobber(rv, l2);
                        rv.last_line = l2.last_line;
                        rv.last_column = l2.last_column;
                        if (rv.range && l2.range) {
                            rv.range[1] = l2.range[1];
                        }
                    }
                    return rv;
                }
            }

            if (!l1) {
                l1 = l2;
                l2 = null;
            }
            if (!l1) {
                return undefined;
            }

            // shallow-copy L1|L2, before we try to adjust the yylloc values: after all, we MAY be looking
            // at unconventional yylloc info objects...
            rv = shallow_copy(l1);

            // first_line: ...,
            // first_column: ...,
            // last_line: ...,
            // last_column: ...,
            if (rv.range) {
                // shallow copy the yylloc ranges info to prevent us from modifying the original arguments' entries:
                rv.range = rv.range.slice(0);
            }

            if (l2) {
                shallow_copy_noclobber(rv, l2);
                rv.last_line = l2.last_line;
                rv.last_column = l2.last_column;
                if (rv.range && l2.range) {
                    rv.range[1] = l2.range[1];
                }
            }

            return rv;
        };

        // NOTE: as this API uses parse() as a closure, it MUST be set again on every parse() invocation,
        //       or else your `lexer`, `sharedState`, etc. references will be *wrong*!
        this.constructParseErrorInfo = function parser_constructParseErrorInfo(msg, ex, expected, recoverable) {
            var pei = {
                errStr: msg,
                exception: ex,
                text: lexer.match,
                value: lexer.yytext,
                token: this.describeSymbol(symbol) || symbol,
                token_id: symbol,
                line: lexer.yylineno,
                loc: copy_yylloc(lexer.yylloc),
                expected: expected,
                recoverable: recoverable,
                state: state,
                action: action,
                new_state: newState,
                symbol_stack: stack,
                state_stack: sstack,
                value_stack: vstack,
                location_stack: lstack,
                stack_pointer: sp,
                yy: sharedState_yy,
                lexer: lexer,
                parser: this,

                // and make sure the error info doesn't stay due to potential
                // ref cycle via userland code manipulations.
                // These would otherwise all be memory leak opportunities!
                //
                // Note that only array and object references are nuked as those
                // constitute the set of elements which can produce a cyclic ref.
                // The rest of the members is kept intact as they are harmless.
                destroy: function destructParseErrorInfo() {
                    // remove cyclic references added to error info:
                    // info.yy = null;
                    // info.lexer = null;
                    // info.value = null;
                    // info.value_stack = null;
                    // ...
                    var rec = !!this.recoverable;
                    for (var key in this) {
                        if (this.hasOwnProperty(key) && typeof key === 'object') {
                            this[key] = undefined;
                        }
                    }
                    this.recoverable = rec;
                }
            };
            // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
            this.__error_infos.push(pei);
            return pei;
        };

        // clone some parts of the (possibly enhanced!) errorInfo object
        // to give them some persistence.
        this.shallowCopyErrorInfo = function parser_shallowCopyErrorInfo(p) {
            var rv = shallow_copy(p);

            // remove the large parts which can only cause cyclic references
            // and are otherwise available from the parser kernel anyway.
            delete rv.sharedState_yy;
            delete rv.parser;
            delete rv.lexer;

            // lexer.yytext MAY be a complex value object, rather than a simple string/value:
            rv.value = shallow_copy(rv.value);

            // yylloc info:
            rv.loc = copy_yylloc(rv.loc);

            // the 'expected' set won't be modified, so no need to clone it:
            //rv.expected = rv.expected.slice(0);

            //symbol stack is a simple array:
            rv.symbol_stack = rv.symbol_stack.slice(0);
            // ditto for state stack:
            rv.state_stack = rv.state_stack.slice(0);
            // clone the yylloc's in the location stack?:
            rv.location_stack = rv.location_stack.map(copy_yylloc);
            // and the value stack may carry both simple and complex values:
            // shallow-copy the latter.
            rv.value_stack = rv.value_stack.map(shallow_copy);

            // and we don't bother with the sharedState_yy reference:
            //delete rv.yy;

            // now we prepare for tracking the COMBINE actions
            // in the error recovery code path:
            //
            // as we want to keep the maximum error info context, we
            // *scan* the state stack to find the first *empty* slot.
            // This position will surely be AT OR ABOVE the current
            // stack pointer, but we want to keep the 'used but discarded'
            // part of the parse stacks *intact* as those slots carry
            // error context that may be useful when you want to produce
            // very detailed error diagnostic reports.
            //
            // ### Purpose of each stack pointer:
            //
            // - stack_pointer: points at the top of the parse stack
            //                  **as it existed at the time of the error
            //                  occurrence, i.e. at the time the stack
            //                  snapshot was taken and copied into the
            //                  errorInfo object.**
            // - base_pointer:  the bottom of the **empty part** of the
            //                  stack, i.e. **the start of the rest of
            //                  the stack space /above/ the existing
            //                  parse stack. This section will be filled
            //                  by the error recovery process as it
            //                  travels the parse state machine to
            //                  arrive at the resolving error recovery rule.**
            // - info_stack_pointer:
            //                  this stack pointer points to the **top of
            //                  the error ecovery tracking stack space**, i.e.
            //                  this stack pointer takes up the role of
            //                  the `stack_pointer` for the error recovery
            //                  process. Any mutations in the **parse stack**
            //                  are **copy-appended** to this part of the
            //                  stack space, keeping the bottom part of the
            //                  stack (the 'snapshot' part where the parse
            //                  state at the time of error occurrence was kept)
            //                  intact.
            // - root_failure_pointer:
            //                  copy of the `stack_pointer`...
            //
            for (var i = rv.stack_pointer; typeof rv.state_stack[i] !== 'undefined'; i++) {
                // empty
            }
            rv.base_pointer = i;
            rv.info_stack_pointer = i;

            rv.root_failure_pointer = rv.stack_pointer;

            // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
            this.__error_recovery_infos.push(rv);

            return rv;
        };


        function stdLex() {
            var token = lexer.lex();
            // if token isn't its numeric value, convert
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }

            return token || EOF;
        }

        function fastLex() {
            var token = lexer.fastLex();
            // if token isn't its numeric value, convert
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }

            return token || EOF;
        }

        var lex = stdLex;


        var state, action, r, t;
        var yyval = {
            $: true,
            _$: undefined,
            yy: sharedState_yy
        };
        var p;
        var yyrulelen;
        var this_production;
        var newState;
        var retval = false;


        // Return the rule stack depth where the nearest error rule can be found.
        // Return -1 when no error recovery rule was found.
        function locateNearestErrorRecoveryRule(state) {
            var stack_probe = sp - 1;
            var depth = 0;

            // try to recover from error
            while (stack_probe >= 0) {
                // check for error recovery rule in this state









                var t = table[state][TERROR] || NO_ACTION;
                if (t[0]) {
                    // We need to make sure we're not cycling forever:
                    // once we hit EOF, even when we `yyerrok()` an error, we must
                    // prevent the core from running forever,
                    // e.g. when parent rules are still expecting certain input to
                    // follow after this, for example when you handle an error inside a set
                    // of braces which are matched by a parent rule in your grammar.
                    //
                    // Hence we require that every error handling/recovery attempt
                    // *after we've hit EOF* has a diminishing state stack: this means
                    // we will ultimately have unwound the state stack entirely and thus
                    // terminate the parse in a controlled fashion even when we have
                    // very complex error/recovery code interplay in the core + user
                    // action code blocks:









                    if (symbol === EOF) {
                        if (lastEofErrorStateDepth > sp - 1 - depth) {
                            lastEofErrorStateDepth = sp - 1 - depth;
                        } else {









                            --stack_probe; // popStack(1): [symbol, action]
                            state = sstack[stack_probe];
                            ++depth;
                            continue;
                        }
                    }
                    return depth;
                }
                if (state === 0 /* $accept rule */ || stack_probe < 1) {









                    return -1; // No suitable error recovery rule available.
                }
                --stack_probe; // popStack(1): [symbol, action]
                state = sstack[stack_probe];
                ++depth;
            }









            return -1; // No suitable error recovery rule available.
        }


        try {
            this.__reentrant_call_depth++;

            lexer.setInput(input, sharedState_yy);

            // NOTE: we *assume* no lexer pre/post handlers are set up *after* 
            // this initial `setInput()` call: hence we can now check and decide
            // whether we'll go with the standard, slower, lex() API or the
            // `fast_lex()` one:
            if (typeof lexer.canIUse === 'function') {
                var lexerInfo = lexer.canIUse();
                if (lexerInfo.fastLex && typeof fastLex === 'function') {
                    lex = fastLex;
                }
            } 

            yyloc = lexer.yylloc;
            lstack[sp] = yyloc;
            vstack[sp] = null;
            sstack[sp] = 0;
            stack[sp] = 0;
            ++sp;





            if (this.pre_parse) {
                this.pre_parse.call(this, sharedState_yy);
            }
            if (sharedState_yy.pre_parse) {
                sharedState_yy.pre_parse.call(this, sharedState_yy);
            }

            newState = sstack[sp - 1];
            for (;;) {
                // retrieve state number from top of stack
                state = newState;               // sstack[sp - 1];

                // use default actions if available
                if (this.defaultActions[state]) {
                    action = 2;
                    newState = this.defaultActions[state];
                } else {
                    // The single `==` condition below covers both these `===` comparisons in a single
                    // operation:
                    //
                    //     if (symbol === null || typeof symbol === 'undefined') ...
                    if (!symbol) {
                        symbol = lex();
                    }
                    // read action for current state and first input
                    t = (table[state] && table[state][symbol]) || NO_ACTION;
                    newState = t[1];
                    action = t[0];











                    // handle parse error
                    if (!action) {
                        // first see if there's any chance at hitting an error recovery rule:
                        var error_rule_depth = locateNearestErrorRecoveryRule(state);
                        var errStr = null;
                        var errSymbolDescr = (this.describeSymbol(symbol) || symbol);
                        var expected = this.collect_expected_token_set(state);

                        if (!recovering) {
                            // Report error
                            if (typeof lexer.yylineno === 'number') {
                                errStr = 'Parse error on line ' + (lexer.yylineno + 1) + ': ';
                            } else {
                                errStr = 'Parse error: ';
                            }

                            if (typeof lexer.showPosition === 'function') {
                                errStr += '\n' + lexer.showPosition(79 - 10, 10) + '\n';
                            }
                            if (expected.length) {
                                errStr += 'Expecting ' + expected.join(', ') + ', got unexpected ' + errSymbolDescr;
                            } else {
                                errStr += 'Unexpected ' + errSymbolDescr;
                            }

                            p = this.constructParseErrorInfo(errStr, null, expected, (error_rule_depth >= 0));

                            // DO NOT cleanup the old one before we start the new error info track:
                            // the old one will *linger* on the error stack and stay alive until we 
                            // invoke the parser's cleanup API!
                            recoveringErrorInfo = this.shallowCopyErrorInfo(p);










                            r = this.parseError(p.errStr, p, this.JisonParserError);
                            if (typeof r !== 'undefined') {
                                retval = r;
                                break;
                            }

                            // Protect against overly blunt userland `parseError` code which *sets*
                            // the `recoverable` flag without properly checking first:
                            // we always terminate the parse when there's no recovery rule available anyhow!
                            if (!p.recoverable || error_rule_depth < 0) {
                                break;
                            } else {
                                // TODO: allow parseError callback to edit symbol and or state at the start of the error recovery process...
                            }
                        }










                        var esp = recoveringErrorInfo.info_stack_pointer;

                        // just recovered from another error
                        if (recovering === ERROR_RECOVERY_TOKEN_DISCARD_COUNT && error_rule_depth >= 0) {
                            // SHIFT current lookahead and grab another
                            recoveringErrorInfo.symbol_stack[esp] = symbol;
                            recoveringErrorInfo.value_stack[esp] = shallow_copy(lexer.yytext);
                            recoveringErrorInfo.location_stack[esp] = copy_yylloc(lexer.yylloc);
                            recoveringErrorInfo.state_stack[esp] = newState; // push state
                            ++esp;

                            // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:



                            yyloc = lexer.yylloc;

                            preErrorSymbol = 0;
                            symbol = lex();









                        }

                        // try to recover from error
                        if (error_rule_depth < 0) {
                            ASSERT(recovering > 0, "line 897");
                            recoveringErrorInfo.info_stack_pointer = esp;

                            // barf a fatal hairball when we're out of look-ahead symbols and none hit a match
                            // while we are still busy recovering from another error:
                            var po = this.__error_infos[this.__error_infos.length - 1];

                            // Report error
                            if (typeof lexer.yylineno === 'number') {
                                errStr = 'Parsing halted on line ' + (lexer.yylineno + 1) + ' while starting to recover from another error';
                            } else {
                                errStr = 'Parsing halted while starting to recover from another error';
                            }

                            if (po) {
                                errStr += ' -- previous error which resulted in this fatal result: ' + po.errStr;
                            } else {
                                errStr += ': ';
                            }

                            if (typeof lexer.showPosition === 'function') {
                                errStr += '\n' + lexer.showPosition(79 - 10, 10) + '\n';
                            }
                            if (expected.length) {
                                errStr += 'Expecting ' + expected.join(', ') + ', got unexpected ' + errSymbolDescr;
                            } else {
                                errStr += 'Unexpected ' + errSymbolDescr;
                            }

                            p = this.constructParseErrorInfo(errStr, null, expected, false);
                            if (po) {
                                p.extra_error_attributes = po;
                            }

                            r = this.parseError(p.errStr, p, this.JisonParserError);
                            if (typeof r !== 'undefined') {
                                retval = r;
                            }
                            break;
                        }

                        preErrorSymbol = (symbol === TERROR ? 0 : symbol); // save the lookahead token
                        symbol = TERROR;            // insert generic error symbol as new lookahead

                        const EXTRA_STACK_SAMPLE_DEPTH = 3;

                        // REDUCE/COMBINE the pushed terms/tokens to a new ERROR token:
                        recoveringErrorInfo.symbol_stack[esp] = preErrorSymbol;
                        if (errStr) {
                            recoveringErrorInfo.value_stack[esp] = {
                                yytext: shallow_copy(lexer.yytext),
                                errorRuleDepth: error_rule_depth,
                                errStr: errStr,
                                errorSymbolDescr: errSymbolDescr,
                                expectedStr: expected,
                                stackSampleLength: error_rule_depth + EXTRA_STACK_SAMPLE_DEPTH
                            };









                        } else {
                            recoveringErrorInfo.value_stack[esp] = {
                                yytext: shallow_copy(lexer.yytext),
                                errorRuleDepth: error_rule_depth,
                                stackSampleLength: error_rule_depth + EXTRA_STACK_SAMPLE_DEPTH
                            };
                        }
                        recoveringErrorInfo.location_stack[esp] = copy_yylloc(lexer.yylloc);
                        recoveringErrorInfo.state_stack[esp] = newState || NO_ACTION[1];

                        ++esp;
                        recoveringErrorInfo.info_stack_pointer = esp;

                        yyval.$ = recoveringErrorInfo;
                        yyval._$ = undefined;

                        yyrulelen = error_rule_depth;









                        r = this.performAction.call(yyval, yyloc, NO_ACTION[1], sp - 1, vstack, lstack);

                        if (typeof r !== 'undefined') {
                            retval = r;
                            break;
                        }

                        // pop off stack
                        sp -= yyrulelen;

                        // and move the top entries + discarded part of the parse stacks onto the error info stack:
                        for (var idx = sp - EXTRA_STACK_SAMPLE_DEPTH, top = idx + yyrulelen; idx < top; idx++, esp++) {
                            recoveringErrorInfo.symbol_stack[esp] = stack[idx];
                            recoveringErrorInfo.value_stack[esp] = shallow_copy(vstack[idx]);
                            recoveringErrorInfo.location_stack[esp] = copy_yylloc(lstack[idx]);
                            recoveringErrorInfo.state_stack[esp] = sstack[idx];
                        }

                        recoveringErrorInfo.symbol_stack[esp] = TERROR;
                        recoveringErrorInfo.value_stack[esp] = shallow_copy(yyval.$);
                        recoveringErrorInfo.location_stack[esp] = copy_yylloc(yyval._$);

                        // goto new state = table[STATE][NONTERMINAL]
                        newState = sstack[sp - 1];

                        if (this.defaultActions[newState]) {
                            recoveringErrorInfo.state_stack[esp] = this.defaultActions[newState];
                        } else {
                            t = (table[newState] && table[newState][symbol]) || NO_ACTION;
                            recoveringErrorInfo.state_stack[esp] = t[1];
                        }

                        ++esp;
                        recoveringErrorInfo.info_stack_pointer = esp;

                        // allow N (default: 3) real symbols to be shifted before reporting a new error
                        recovering = ERROR_RECOVERY_TOKEN_DISCARD_COUNT;










                        // Now duplicate the standard parse machine here, at least its initial
                        // couple of rounds until the TERROR symbol is **pushed onto the parse stack**,
                        // as we wish to push something special then!
                        //
                        // Run the state machine in this copy of the parser state machine
                        // until we *either* consume the error symbol (and its related information)
                        // *or* we run into another error while recovering from this one
                        // *or* we execute a `reduce` action which outputs a final parse
                        // result (yes, that MAY happen!).
                        //
                        // We stay in this secondary parse loop until we have completed
                        // the *error recovery phase* as the main parse loop (further below)
                        // is optimized for regular parse operation and DOES NOT cope with
                        // error recovery *at all*.
                        //
                        // We call the secondary parse loop just below the "slow parse loop",
                        // while the main parse loop, which is an almost-duplicate of this one,
                        // yet optimized for regular parse operation, is called the "fast
                        // parse loop".
                        //
                        // Compare this to `bison` & (vanilla) `jison`, both of which have
                        // only a single parse loop, which handles everything. Our goal is
                        // to eke out every drop of performance in the main parse loop...

                        ASSERT(recoveringErrorInfo, "line 1049");
                        ASSERT(symbol === TERROR, "line 1050");
                        ASSERT(!action, "line 1051");
                        var errorSymbolFromParser = true;
                        for (;;) {
                            // retrieve state number from top of stack
                            state = newState;               // sstack[sp - 1];

                            // use default actions if available
                            if (this.defaultActions[state]) {
                                action = 2;
                                newState = this.defaultActions[state];
                            } else {
                                // The single `==` condition below covers both these `===` comparisons in a single
                                // operation:
                                //
                                //     if (symbol === null || typeof symbol === 'undefined') ...
                                if (!symbol) {
                                    symbol = lex();
                                    // **Warning: Edge Case**: the *lexer* may produce
                                    // TERROR tokens of its own volition: *those* TERROR
                                    // tokens should be treated like *regular tokens*
                                    // i.e. tokens which have a lexer-provided `yyvalue`
                                    // and `yylloc`:
                                    errorSymbolFromParser = false;
                                }
                                // read action for current state and first input
                                t = (table[state] && table[state][symbol]) || NO_ACTION;
                                newState = t[1];
                                action = t[0];










                                // encountered another parse error? If so, break out to main loop
                                // and take it from there!
                                if (!action) {










                                    ASSERT(recoveringErrorInfo, "line 1087");

                                    // Prep state variables so that upon breaking out of
                                    // this "slow parse loop" and hitting the `continue;`
                                    // statement in the outer "fast parse loop" we redo
                                    // the exact same state table lookup as the one above
                                    // so that the outer=main loop will also correctly
                                    // detect the 'parse error' state (`!action`) we have
                                    // just encountered above.
                                    newState = state;
                                    break;
                                }
                            }










                            switch (action) {
                            // catch misc. parse failures:
                            default:
                                // this shouldn't happen, unless resolve defaults are off
                                //
                                // SILENTLY SIGNAL that the outer "fast parse loop" should
                                // take care of this internal error condition:
                                // prevent useless code duplication now/here.
                                break;

                            // shift:
                            case 1:
                                stack[sp] = symbol;
                                // ### Note/Warning ###
                                //
                                // The *lexer* may also produce TERROR tokens on its own,
                                // so we specifically test for the TERROR we did set up
                                // in the error recovery logic further above!
                                if (symbol === TERROR && errorSymbolFromParser) {
                                    // Push a special value onto the stack when we're
                                    // shifting the `error` symbol that is related to the
                                    // error we're recovering from.
                                    ASSERT(recoveringErrorInfo, "line 1131");
                                    vstack[sp] = recoveringErrorInfo;
                                    lstack[sp] = this.yyMergeLocationInfo(null, null, recoveringErrorInfo.loc, lexer.yylloc, true);
                                } else {
                                    ASSERT(symbol !== 0, "line 1135");
                                    ASSERT(preErrorSymbol === 0, "line 1136");
                                    vstack[sp] = lexer.yytext;
                                    lstack[sp] = copy_yylloc(lexer.yylloc);
                                }
                                sstack[sp] = newState; // push state

                                ++sp;
                                symbol = 0;
                                // **Warning: Edge Case**: the *lexer* may have produced
                                // TERROR tokens of its own volition: *those* TERROR
                                // tokens should be treated like *regular tokens*
                                // i.e. tokens which have a lexer-provided `yyvalue`
                                // and `yylloc`:
                                errorSymbolFromParser = false;
                                if (!preErrorSymbol) { // normal execution / no error
                                    // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:



                                    yyloc = lexer.yylloc;

                                    if (recovering > 0) {
                                        recovering--;









                                    }
                                } else {
                                    // error just occurred, resume old lookahead f/ before error, *unless* that drops us straight back into error mode:
                                    ASSERT(recovering > 0, "line 1163");
                                    symbol = preErrorSymbol;
                                    preErrorSymbol = 0;









                                    // read action for current state and first input
                                    t = (table[newState] && table[newState][symbol]) || NO_ACTION;
                                    if (!t[0] || symbol === TERROR) {
                                        // forget about that symbol and move forward: this wasn't a 'forgot to insert' error type where
                                        // (simple) stuff might have been missing before the token which caused the error we're
                                        // recovering from now...
                                        //
                                        // Also check if the LookAhead symbol isn't the ERROR token we set as part of the error
                                        // recovery, for then this we would we idling (cycling) on the error forever.
                                        // Yes, this does not take into account the possibility that the *lexer* may have
                                        // produced a *new* TERROR token all by itself, but that would be a very peculiar grammar!









                                        symbol = 0;
                                    }
                                }

                                // once we have pushed the special ERROR token value,
                                // we REMAIN in this inner, "slow parse loop" until
                                // the entire error recovery phase has completed.
                                //
                                // ### Note About Edge Case ###
                                //
                                // Userland action code MAY already have 'reset' the
                                // error recovery phase marker `recovering` to ZERO(0)
                                // while the error symbol hasn't been shifted onto
                                // the stack yet. Hence we only exit this "slow parse loop"
                                // when *both* conditions are met!
                                ASSERT(preErrorSymbol === 0, "line 1194");
                                if (recovering === 0) {
                                    break;
                                }
                                continue;

                            // reduce:
                            case 2:
                                this_production = this.productions_[newState - 1];  // `this.productions_[]` is zero-based indexed while states start from 1 upwards...
                                yyrulelen = this_production[1];










                                r = this.performAction.call(yyval, yyloc, newState, sp - 1, vstack, lstack);

                                if (typeof r !== 'undefined') {
                                    // signal end of error recovery loop AND end of outer parse loop
                                    action = 3;
                                    sp = -2;      // magic number: signal outer "fast parse loop" ACCEPT state that we already have a properly set up `retval` parser return value.
                                    retval = r;
                                    break;
                                }

                                // pop off stack
                                sp -= yyrulelen;

                                // don't overwrite the `symbol` variable: use a local var to speed things up:
                                var ntsymbol = this_production[0];    // push nonterminal (reduce)
                                stack[sp] = ntsymbol;
                                vstack[sp] = yyval.$;
                                lstack[sp] = yyval._$;
                                // goto new state = table[STATE][NONTERMINAL]
                                newState = table[sstack[sp - 1]][ntsymbol];
                                sstack[sp] = newState;
                                ++sp;









                                continue;

                            // accept:
                            case 3:
                                retval = true;
                                // Return the `$accept` rule's `$$` result, if available.
                                //
                                // Also note that JISON always adds this top-most `$accept` rule (with implicit,
                                // default, action):
                                //
                                //     $accept: <startSymbol> $end
                                //                  %{ $$ = $1; @$ = @1; %}
                                //
                                // which, combined with the parse kernel's `$accept` state behaviour coded below,
                                // will produce the `$$` value output of the <startSymbol> rule as the parse result,
                                // IFF that result is *not* `undefined`. (See also the parser kernel code.)
                                //
                                // In code:
                                //
                                //                  %{
                                //                      @$ = @1;            // if location tracking support is included
                                //                      if (typeof $1 !== 'undefined')
                                //                          return $1;
                                //                      else
                                //                          return true;           // the default parse result if the rule actions don't produce anything
                                //                  %}
                                sp--;
                                if (sp >= 0 && typeof vstack[sp] !== 'undefined') {
                                    retval = vstack[sp];
                                }
                                sp = -2;      // magic number: signal outer "fast parse loop" ACCEPT state that we already have a properly set up `retval` parser return value.
                                break;
                            }

                            // break out of loop: we accept or fail with error
                            break;
                        }

                        // should we also break out of the regular/outer parse loop,
                        // i.e. did the parser already produce a parse result in here?!
                        // *or* did we hit an unsupported parse state, to be handled
                        // in the `switch/default` code further below?
                        ASSERT(action !== 2, "line 1272");
                        if (!action || action === 1) {
                            continue;
                        }
                    }


                }










                switch (action) {
                // catch misc. parse failures:
                default:
                    // this shouldn't happen, unless resolve defaults are off
                    if (action instanceof Array) {
                        p = this.constructParseErrorInfo('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol, null, null, false);
                        r = this.parseError(p.errStr, p, this.JisonParserError);
                        if (typeof r !== 'undefined') {
                            retval = r;
                        }
                        break;
                    }
                    // Another case of better safe than sorry: in case state transitions come out of another error recovery process
                    // or a buggy LUT (LookUp Table):
                    p = this.constructParseErrorInfo('Parsing halted. No viable error recovery approach available due to internal system failure.', null, null, false);
                    r = this.parseError(p.errStr, p, this.JisonParserError);
                    if (typeof r !== 'undefined') {
                        retval = r;
                    }
                    break;

                // shift:
                case 1:
                    stack[sp] = symbol;
                    vstack[sp] = lexer.yytext;
                    lstack[sp] = copy_yylloc(lexer.yylloc);
                    sstack[sp] = newState; // push state

                    ++sp;
                    symbol = 0;

                    ASSERT(preErrorSymbol === 0, "line 1352");         // normal execution / no error
                    ASSERT(recovering === 0, "line 1353");             // normal execution / no error

                    // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:



                    yyloc = lexer.yylloc;
                    continue;

                // reduce:
                case 2:
                    ASSERT(preErrorSymbol === 0, "line 1364");         // normal execution / no error
                    ASSERT(recovering === 0, "line 1365");             // normal execution / no error

                    this_production = this.productions_[newState - 1];  // `this.productions_[]` is zero-based indexed while states start from 1 upwards...
                    yyrulelen = this_production[1];










                    r = this.performAction.call(yyval, yyloc, newState, sp - 1, vstack, lstack);

                    if (typeof r !== 'undefined') {
                        retval = r;
                        break;
                    }

                    // pop off stack
                    sp -= yyrulelen;

                    // don't overwrite the `symbol` variable: use a local var to speed things up:
                    var ntsymbol = this_production[0];    // push nonterminal (reduce)
                    stack[sp] = ntsymbol;
                    vstack[sp] = yyval.$;
                    lstack[sp] = yyval._$;
                    // goto new state = table[STATE][NONTERMINAL]
                    newState = table[sstack[sp - 1]][ntsymbol];
                    sstack[sp] = newState;
                    ++sp;









                    continue;

                // accept:
                case 3:
                    if (sp !== -2) {
                        retval = true;
                        // Return the `$accept` rule's `$$` result, if available.
                        //
                        // Also note that JISON always adds this top-most `$accept` rule (with implicit,
                        // default, action):
                        //
                        //     $accept: <startSymbol> $end
                        //                  %{ $$ = $1; @$ = @1; %}
                        //
                        // which, combined with the parse kernel's `$accept` state behaviour coded below,
                        // will produce the `$$` value output of the <startSymbol> rule as the parse result,
                        // IFF that result is *not* `undefined`. (See also the parser kernel code.)
                        //
                        // In code:
                        //
                        //                  %{
                        //                      @$ = @1;            // if location tracking support is included
                        //                      if (typeof $1 !== 'undefined')
                        //                          return $1;
                        //                      else
                        //                          return true;           // the default parse result if the rule actions don't produce anything
                        //                  %}
                        sp--;
                        if (typeof vstack[sp] !== 'undefined') {
                            retval = vstack[sp];
                        }
                    }
                    break;
                }

                // break out of loop: we accept or fail with error
                break;
            }
        } catch (ex) {
            // report exceptions through the parseError callback too, but keep the exception intact
            // if it is a known parser or lexer error which has been thrown by parseError() already:
            if (ex instanceof this.JisonParserError) {
                throw ex;
            }
            else if (lexer && typeof lexer.JisonLexerError === 'function' && ex instanceof lexer.JisonLexerError) {
                throw ex;
            }

            p = this.constructParseErrorInfo('Parsing aborted due to exception.', ex, null, false);
            retval = false;
            r = this.parseError(p.errStr, p, this.JisonParserError);
            if (typeof r !== 'undefined') {
                retval = r;
            }
        } finally {
            retval = this.cleanupAfterParse(retval, true, true);
            this.__reentrant_call_depth--;
        }   // /finally

        return retval;
    },
    yyError: 1
    };
    parser$2.originalParseError = parser$2.parseError;
    parser$2.originalQuoteName = parser$2.quoteName;
    /* lexer generated by jison-lex 0.6.2-220 */

    /*
     * Returns a Lexer object of the following structure:
     *
     *  Lexer: {
     *    yy: {}     The so-called "shared state" or rather the *source* of it;
     *               the real "shared state" `yy` passed around to
     *               the rule actions, etc. is a direct reference!
     *
     *               This "shared context" object was passed to the lexer by way of 
     *               the `lexer.setInput(str, yy)` API before you may use it.
     *
     *               This "shared context" object is passed to the lexer action code in `performAction()`
     *               so userland code in the lexer actions may communicate with the outside world 
     *               and/or other lexer rules' actions in more or less complex ways.
     *
     *  }
     *
     *  Lexer.prototype: {
     *    EOF: 1,
     *    ERROR: 2,
     *
     *    yy:        The overall "shared context" object reference.
     *
     *    JisonLexerError: function(msg, hash),
     *
     *    performAction: function lexer__performAction(yy, yyrulenumber, YY_START),
     *
     *               The function parameters and `this` have the following value/meaning:
     *               - `this`    : reference to the `lexer` instance. 
     *                               `yy_` is an alias for `this` lexer instance reference used internally.
     *
     *               - `yy`      : a reference to the `yy` "shared state" object which was passed to the lexer
     *                             by way of the `lexer.setInput(str, yy)` API before.
     *
     *                             Note:
     *                             The extra arguments you specified in the `%parse-param` statement in your
     *                             **parser** grammar definition file are passed to the lexer via this object
     *                             reference as member variables.
     *
     *               - `yyrulenumber`   : index of the matched lexer rule (regex), used internally.
     *
     *               - `YY_START`: the current lexer "start condition" state.
     *
     *    parseError: function(str, hash, ExceptionClass),
     *
     *    constructLexErrorInfo: function(error_message, is_recoverable),
     *               Helper function.
     *               Produces a new errorInfo 'hash object' which can be passed into `parseError()`.
     *               See it's use in this lexer kernel in many places; example usage:
     *
     *                   var infoObj = lexer.constructParseErrorInfo('fail!', true);
     *                   var retVal = lexer.parseError(infoObj.errStr, infoObj, lexer.JisonLexerError);
     *
     *    options: { ... lexer %options ... },
     *
     *    lex: function(),
     *               Produce one token of lexed input, which was passed in earlier via the `lexer.setInput()` API.
     *               You MAY use the additional `args...` parameters as per `%parse-param` spec of the **lexer** grammar:
     *               these extra `args...` are added verbatim to the `yy` object reference as member variables.
     *
     *               WARNING:
     *               Lexer's additional `args...` parameters (via lexer's `%parse-param`) MAY conflict with
     *               any attributes already added to `yy` by the **parser** or the jison run-time; 
     *               when such a collision is detected an exception is thrown to prevent the generated run-time 
     *               from silently accepting this confusing and potentially hazardous situation! 
     *
     *    cleanupAfterLex: function(do_not_nuke_errorinfos),
     *               Helper function.
     *
     *               This helper API is invoked when the **parse process** has completed: it is the responsibility
     *               of the **parser** (or the calling userland code) to invoke this method once cleanup is desired. 
     *
     *               This helper may be invoked by user code to ensure the internal lexer gets properly garbage collected.
     *
     *    setInput: function(input, [yy]),
     *
     *
     *    input: function(),
     *
     *
     *    unput: function(str),
     *
     *
     *    more: function(),
     *
     *
     *    reject: function(),
     *
     *
     *    less: function(n),
     *
     *
     *    pastInput: function(n),
     *
     *
     *    upcomingInput: function(n),
     *
     *
     *    showPosition: function(),
     *
     *
     *    test_match: function(regex_match_array, rule_index),
     *
     *
     *    next: function(),
     *
     *
     *    begin: function(condition),
     *
     *
     *    pushState: function(condition),
     *
     *
     *    popState: function(),
     *
     *
     *    topState: function(),
     *
     *
     *    _currentRules: function(),
     *
     *
     *    stateStackSize: function(),
     *
     *
     *    performAction: function(yy, yy_, yyrulenumber, YY_START),
     *
     *
     *    rules: [...],
     *
     *
     *    conditions: {associative list: name ==> set},
     *  }
     *
     *
     *  token location info (`yylloc`): {
     *    first_line: n,
     *    last_line: n,
     *    first_column: n,
     *    last_column: n,
     *    range: [start_number, end_number]
     *               (where the numbers are indexes into the input string, zero-based)
     *  }
     *
     * ---
     *
     * The `parseError` function receives a 'hash' object with these members for lexer errors:
     *
     *  {
     *    text:        (matched text)
     *    token:       (the produced terminal token, if any)
     *    token_id:    (the produced terminal token numeric ID, if any)
     *    line:        (yylineno)
     *    loc:         (yylloc)
     *    recoverable: (boolean: TRUE when the parser MAY have an error recovery rule
     *                  available for this particular error)
     *    yy:          (object: the current parser internal "shared state" `yy`
     *                  as is also available in the rule actions; this can be used,
     *                  for instance, for advanced error analysis and reporting)
     *    lexer:       (reference to the current lexer instance used by the parser)
     *  }
     *
     * while `this` will reference the current lexer instance.
     *
     * When `parseError` is invoked by the lexer, the default implementation will
     * attempt to invoke `yy.parser.parseError()`; when this callback is not provided
     * it will try to invoke `yy.parseError()` instead. When that callback is also not
     * provided, a `JisonLexerError` exception will be thrown containing the error
     * message and `hash`, as constructed by the `constructLexErrorInfo()` API.
     *
     * Note that the lexer's `JisonLexerError` error class is passed via the
     * `ExceptionClass` argument, which is invoked to construct the exception
     * instance to be thrown, so technically `parseError` will throw the object
     * produced by the `new ExceptionClass(str, hash)` JavaScript expression.
     *
     * ---
     *
     * You can specify lexer options by setting / modifying the `.options` object of your Lexer instance.
     * These options are available:
     *
     * (Options are permanent.)
     *  
     *  yy: {
     *      parseError: function(str, hash, ExceptionClass)
     *                 optional: overrides the default `parseError` function.
     *  }
     *
     *  lexer.options: {
     *      pre_lex:  function()
     *                 optional: is invoked before the lexer is invoked to produce another token.
     *                 `this` refers to the Lexer object.
     *      post_lex: function(token) { return token; }
     *                 optional: is invoked when the lexer has produced a token `token`;
     *                 this function can override the returned token value by returning another.
     *                 When it does not return any (truthy) value, the lexer will return
     *                 the original `token`.
     *                 `this` refers to the Lexer object.
     *
     * WARNING: the next set of options are not meant to be changed. They echo the abilities of
     * the lexer as per when it was compiled!
     *
     *      ranges: boolean
     *                 optional: `true` ==> token location info will include a .range[] member.
     *      flex: boolean
     *                 optional: `true` ==> flex-like lexing behaviour where the rules are tested
     *                 exhaustively to find the longest match.
     *      backtrack_lexer: boolean
     *                 optional: `true` ==> lexer regexes are tested in order and for invoked;
     *                 the lexer terminates the scan when a token is returned by the action code.
     *      xregexp: boolean
     *                 optional: `true` ==> lexer rule regexes are "extended regex format" requiring the
     *                 `XRegExp` library. When this %option has not been specified at compile time, all lexer
     *                 rule regexes have been written as standard JavaScript RegExp expressions.
     *  }
     */


    var lexer$1 = function() {
      /**
       * See also:
       * http://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/#35881508
       * but we keep the prototype.constructor and prototype.name assignment lines too for compatibility
       * with userland code which might access the derived class in a 'classic' way.
       *
       * @public
       * @constructor
       * @nocollapse
       */
      function JisonLexerError(msg, hash) {

        Object.defineProperty(this, 'name', {
          enumerable: false,
          writable: false,
          value: 'JisonLexerError'
        });

        if (msg == null)
          msg = '???';

        Object.defineProperty(this, 'message', {
          enumerable: false,
          writable: true,
          value: msg
        });

        this.hash = hash;
        var stacktrace;

        if (hash && hash.exception instanceof Error) {
          var ex2 = hash.exception;
          this.message = ex2.message || msg;
          stacktrace = ex2.stack;
        }

        if (!stacktrace) {
          if (Error.hasOwnProperty('captureStackTrace')) {
            // V8
            Error.captureStackTrace(this, this.constructor);
          } else {
            stacktrace = new Error(msg).stack;
          }
        }

        if (stacktrace) {
          Object.defineProperty(this, 'stack', {
            enumerable: false,
            writable: false,
            value: stacktrace
          });
        }
      }

      if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(JisonLexerError.prototype, Error.prototype);
      } else {
        JisonLexerError.prototype = Object.create(Error.prototype);
      }

      JisonLexerError.prototype.constructor = JisonLexerError;
      JisonLexerError.prototype.name = 'JisonLexerError';

      var lexer = {
        
    // Code Generator Information Report
    // ---------------------------------
    //
    // Options:
    //
    //   backtracking: .................... false
    //   location.ranges: ................. true
    //   location line+column tracking: ... true
    //
    //
    // Forwarded Parser Analysis flags:
    //
    //   uses yyleng: ..................... false
    //   uses yylineno: ................... false
    //   uses yytext: ..................... false
    //   uses yylloc: ..................... false
    //   uses lexer values: ............... true / true
    //   location tracking: ............... true
    //   location assignment: ............. true
    //
    //
    // Lexer Analysis flags:
    //
    //   uses yyleng: ..................... ???
    //   uses yylineno: ................... ???
    //   uses yytext: ..................... ???
    //   uses yylloc: ..................... ???
    //   uses ParseError API: ............. ???
    //   uses yyerror: .................... ???
    //   uses location tracking & editing:  ???
    //   uses more() API: ................. ???
    //   uses unput() API: ................ ???
    //   uses reject() API: ............... ???
    //   uses less() API: ................. ???
    //   uses display APIs pastInput(), upcomingInput(), showPosition():
    //        ............................. ???
    //   uses describeYYLLOC() API: ....... ???
    //
    // --------- END OF REPORT -----------

    EOF: 1,
        ERROR: 2,

        // JisonLexerError: JisonLexerError,        /// <-- injected by the code generator

        // options: {},                             /// <-- injected by the code generator

        // yy: ...,                                 /// <-- injected by setInput()

        /// INTERNAL USE ONLY: internal rule set cache for the current lexer state
        __currentRuleSet__: null,

        /// INTERNAL USE ONLY: the set of lexErrorInfo objects created since the last cleanup
        __error_infos: [],

        /// INTERNAL USE ONLY: mark whether the lexer instance has been 'unfolded' completely and is now ready for use
        __decompressed: false,

        /// INTERNAL USE ONLY
        done: false,

        /// INTERNAL USE ONLY
        _backtrack: false,

        /// INTERNAL USE ONLY
        _input: '',

        /// INTERNAL USE ONLY
        _more: false,

        /// INTERNAL USE ONLY
        _signaled_error_token: false,

        /// INTERNAL USE ONLY; managed via `pushState()`, `popState()`, `topState()` and `stateStackSize()`
        conditionStack: [],

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction. `match` is identical to `yytext` except that this one still contains the matched input string after `lexer.performAction()` has been invoked, where userland code MAY have changed/replaced the `yytext` value entirely!
        match: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks entire input which has been matched so far
        matched: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks RE match result for last (successful) match attempt
        matches: false,

        /// ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction; this value is transferred to the parser as the 'token value' when the parser consumes the lexer token produced through a call to the `lex()` API.
        yytext: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks the 'cursor position' in the input string, i.e. the number of characters matched so far
        offset: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: length of matched input for the token under construction (`yytext`)
        yyleng: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: 'line number' at which the token under construction is located
        yylineno: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks location info (lines + columns) for the token under construction
        yylloc: null,

        /**
             * INTERNAL USE: construct a suitable error info hash object instance for `parseError`.
             * 
             * @public
             * @this {RegExpLexer}
             */
        constructLexErrorInfo: function lexer_constructLexErrorInfo(msg, recoverable, show_input_position) {
          msg = '' + msg;

          // heuristic to determine if the error message already contains a (partial) source code dump
          // as produced by either `showPosition()` or `prettyPrintRange()`:
          if (show_input_position == undefined) {
            show_input_position = !(msg.indexOf('\n') > 0 && msg.indexOf('^') > 0);
          }

          if (this.yylloc && show_input_position) {
            if (typeof this.prettyPrintRange === 'function') {
              var pretty_src = this.prettyPrintRange(this.yylloc);

              if (!/\n\s*$/.test(msg)) {
                msg += '\n';
              }

              msg += '\n  Erroneous area:\n' + this.prettyPrintRange(this.yylloc);
            } else if (typeof this.showPosition === 'function') {
              var pos_str = this.showPosition();

              if (pos_str) {
                if (msg.length && msg[msg.length - 1] !== '\n' && pos_str[0] !== '\n') {
                  msg += '\n' + pos_str;
                } else {
                  msg += pos_str;
                }
              }
            }
          }

          /** @constructor */
          var pei = {
            errStr: msg,
            recoverable: !!recoverable,

            // This one MAY be empty; userland code should use the `upcomingInput` API to obtain more text which follows the 'lexer cursor position'...
            text: this.match,

            token: null,
            line: this.yylineno,
            loc: this.yylloc,
            yy: this.yy,
            lexer: this,

            /**
                         * and make sure the error info doesn't stay due to potential
                         * ref cycle via userland code manipulations.
                         * These would otherwise all be memory leak opportunities!
                         * 
                         * Note that only array and object references are nuked as those
                         * constitute the set of elements which can produce a cyclic ref.
                         * The rest of the members is kept intact as they are harmless.
                         * 
                         * @public
                         * @this {LexErrorInfo}
                         */
            destroy: function destructLexErrorInfo() {
              // remove cyclic references added to error info:
              // info.yy = null;
              // info.lexer = null;
              // ...
              var rec = !!this.recoverable;

              for (var key in this) {
                if (this.hasOwnProperty(key) && typeof key === 'object') {
                  this[key] = undefined;
                }
              }

              this.recoverable = rec;
            }
          };

          // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
          this.__error_infos.push(pei);

          return pei;
        },

        /**
             * handler which is invoked when a lexer error occurs.
             * 
             * @public
             * @this {RegExpLexer}
             */
        parseError: function lexer_parseError(str, hash, ExceptionClass) {
          if (!ExceptionClass) {
            ExceptionClass = this.JisonLexerError;
          }

          if (this.yy) {
            if (this.yy.parser && typeof this.yy.parser.parseError === 'function') {
              return this.yy.parser.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            } else if (typeof this.yy.parseError === 'function') {
              return this.yy.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            }
          }

          throw new ExceptionClass(str, hash);
        },

        /**
             * method which implements `yyerror(str, ...args)` functionality for use inside lexer actions.
             * 
             * @public
             * @this {RegExpLexer}
             */
        yyerror: function yyError(str /*, ...args */) {
          var lineno_msg = '';

          if (this.yylloc) {
            lineno_msg = ' on line ' + (this.yylineno + 1);
          }

          var p = this.constructLexErrorInfo(
            'Lexical error' + lineno_msg + ': ' + str,
            this.options.lexerErrorsAreRecoverable
          );

          // Add any extra args to the hash under the name `extra_error_attributes`:
          var args = Array.prototype.slice.call(arguments, 1);

          if (args.length) {
            p.extra_error_attributes = args;
          }

          return this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
        },

        /**
             * final cleanup function for when we have completed lexing the input;
             * make it an API so that external code can use this one once userland
             * code has decided it's time to destroy any lingering lexer error
             * hash object instances and the like: this function helps to clean
             * up these constructs, which *may* carry cyclic references which would
             * otherwise prevent the instances from being properly and timely
             * garbage-collected, i.e. this function helps prevent memory leaks!
             * 
             * @public
             * @this {RegExpLexer}
             */
        cleanupAfterLex: function lexer_cleanupAfterLex(do_not_nuke_errorinfos) {
          // prevent lingering circular references from causing memory leaks:
          this.setInput('', {});

          // nuke the error hash info instances created during this run.
          // Userland code must COPY any data/references
          // in the error hash instance(s) it is more permanently interested in.
          if (!do_not_nuke_errorinfos) {
            for (var i = this.__error_infos.length - 1; i >= 0; i--) {
              var el = this.__error_infos[i];

              if (el && typeof el.destroy === 'function') {
                el.destroy();
              }
            }

            this.__error_infos.length = 0;
          }

          return this;
        },

        /**
             * clear the lexer token context; intended for internal use only
             * 
             * @public
             * @this {RegExpLexer}
             */
        clear: function lexer_clear() {
          this.yytext = '';
          this.yyleng = 0;
          this.match = '';

          // - DO NOT reset `this.matched`
          this.matches = false;

          this._more = false;
          this._backtrack = false;
          var col = this.yylloc ? this.yylloc.last_column : 0;

          this.yylloc = {
            first_line: this.yylineno + 1,
            first_column: col,
            last_line: this.yylineno + 1,
            last_column: col,
            range: [this.offset, this.offset]
          };
        },

        /**
             * resets the lexer, sets new input
             * 
             * @public
             * @this {RegExpLexer}
             */
        setInput: function lexer_setInput(input, yy) {
          this.yy = yy || this.yy || {};

          // also check if we've fully initialized the lexer instance,
          // including expansion work to be done to go from a loaded
          // lexer to a usable lexer:
          if (!this.__decompressed) {
            // step 1: decompress the regex list:
            var rules = this.rules;

            for (var i = 0, len = rules.length; i < len; i++) {
              var rule_re = rules[i];

              // compression: is the RE an xref to another RE slot in the rules[] table?
              if (typeof rule_re === 'number') {
                rules[i] = rules[rule_re];
              }
            }

            // step 2: unfold the conditions[] set to make these ready for use:
            var conditions = this.conditions;

            for (var k in conditions) {
              var spec = conditions[k];
              var rule_ids = spec.rules;
              var len = rule_ids.length;
              var rule_regexes = new Array(len + 1);            // slot 0 is unused; we use a 1-based index approach here to keep the hottest code in `lexer_next()` fast and simple!
              var rule_new_ids = new Array(len + 1);

              for (var i = 0; i < len; i++) {
                var idx = rule_ids[i];
                var rule_re = rules[idx];
                rule_regexes[i + 1] = rule_re;
                rule_new_ids[i + 1] = idx;
              }

              spec.rules = rule_new_ids;
              spec.__rule_regexes = rule_regexes;
              spec.__rule_count = len;
            }

            this.__decompressed = true;
          }

          this._input = input || '';
          this.clear();
          this._signaled_error_token = false;
          this.done = false;
          this.yylineno = 0;
          this.matched = '';
          this.conditionStack = ['INITIAL'];
          this.__currentRuleSet__ = null;

          this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
            range: [0, 0]
          };

          this.offset = 0;
          return this;
        },

        /**
             * edit the remaining input via user-specified callback.
             * This can be used to forward-adjust the input-to-parse, 
             * e.g. inserting macro expansions and alike in the
             * input which has yet to be lexed.
             * The behaviour of this API contrasts the `unput()` et al
             * APIs as those act on the *consumed* input, while this
             * one allows one to manipulate the future, without impacting
             * the current `yyloc` cursor location or any history. 
             * 
             * Use this API to help implement C-preprocessor-like
             * `#include` statements, etc.
             * 
             * The provided callback must be synchronous and is
             * expected to return the edited input (string).
             *
             * The `cpsArg` argument value is passed to the callback
             * as-is.
             *
             * `callback` interface: 
             * `function callback(input, cpsArg)`
             * 
             * - `input` will carry the remaining-input-to-lex string
             *   from the lexer.
             * - `cpsArg` is `cpsArg` passed into this API.
             * 
             * The `this` reference for the callback will be set to
             * reference this lexer instance so that userland code
             * in the callback can easily and quickly access any lexer
             * API. 
             *
             * When the callback returns a non-string-type falsey value,
             * we assume the callback did not edit the input and we
             * will using the input as-is.
             *
             * When the callback returns a non-string-type value, it
             * is converted to a string for lexing via the `"" + retval`
             * operation. (See also why: http://2ality.com/2012/03/converting-to-string.html 
             * -- that way any returned object's `toValue()` and `toString()`
             * methods will be invoked in a proper/desirable order.)
             * 
             * @public
             * @this {RegExpLexer}
             */
        editRemainingInput: function lexer_editRemainingInput(callback, cpsArg) {
          var rv = callback.call(this, this._input, cpsArg);

          if (typeof rv !== 'string') {
            if (rv) {
              this._input = '' + rv;
            }
            // else: keep `this._input` as is. 
          } else {
            this._input = rv;
          }

          return this;
        },

        /**
             * consumes and returns one char from the input
             * 
             * @public
             * @this {RegExpLexer}
             */
        input: function lexer_input() {
          if (!this._input) {
            //this.done = true;    -- don't set `done` as we want the lex()/next() API to be able to produce one custom EOF token match after this anyhow. (lexer can match special <<EOF>> tokens and perform user action code for a <<EOF>> match, but only does so *once*)
            return null;
          }

          var ch = this._input[0];
          this.yytext += ch;
          this.yyleng++;
          this.offset++;
          this.match += ch;
          this.matched += ch;

          // Count the linenumber up when we hit the LF (or a stand-alone CR).
          // On CRLF, the linenumber is incremented when you fetch the CR or the CRLF combo
          // and we advance immediately past the LF as well, returning both together as if
          // it was all a single 'character' only.
          var slice_len = 1;

          var lines = false;

          if (ch === '\n') {
            lines = true;
          } else if (ch === '\r') {
            lines = true;
            var ch2 = this._input[1];

            if (ch2 === '\n') {
              slice_len++;
              ch += ch2;
              this.yytext += ch2;
              this.yyleng++;
              this.offset++;
              this.match += ch2;
              this.matched += ch2;
              this.yylloc.range[1]++;
            }
          }

          if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
            this.yylloc.last_column = 0;
          } else {
            this.yylloc.last_column++;
          }

          this.yylloc.range[1]++;
          this._input = this._input.slice(slice_len);
          return ch;
        },

        /**
             * unshifts one char (or an entire string) into the input
             * 
             * @public
             * @this {RegExpLexer}
             */
        unput: function lexer_unput(ch) {
          var len = ch.length;
          var lines = ch.split(/(?:\r\n?|\n)/g);
          this._input = ch + this._input;
          this.yytext = this.yytext.substr(0, this.yytext.length - len);
          this.yyleng = this.yytext.length;
          this.offset -= len;
          this.match = this.match.substr(0, this.match.length - len);
          this.matched = this.matched.substr(0, this.matched.length - len);

          if (lines.length > 1) {
            this.yylineno -= lines.length - 1;
            this.yylloc.last_line = this.yylineno + 1;

            // Get last entirely matched line into the `pre_lines[]` array's
            // last index slot; we don't mind when other previously 
            // matched lines end up in the array too. 
            var pre = this.match;

            var pre_lines = pre.split(/(?:\r\n?|\n)/g);

            if (pre_lines.length === 1) {
              pre = this.matched;
              pre_lines = pre.split(/(?:\r\n?|\n)/g);
            }

            this.yylloc.last_column = pre_lines[pre_lines.length - 1].length;
          } else {
            this.yylloc.last_column -= len;
          }

          this.yylloc.range[1] = this.yylloc.range[0] + this.yyleng;
          this.done = false;
          return this;
        },

        /**
             * cache matched text and append it on next action
             * 
             * @public
             * @this {RegExpLexer}
             */
        more: function lexer_more() {
          this._more = true;
          return this;
        },

        /**
             * signal the lexer that this rule fails to match the input, so the
             * next matching rule (regex) should be tested instead.
             * 
             * @public
             * @this {RegExpLexer}
             */
        reject: function lexer_reject() {
          if (this.options.backtrack_lexer) {
            this._backtrack = true;
          } else {
            // when the `parseError()` call returns, we MUST ensure that the error is registered.
            // We accomplish this by signaling an 'error' token to be produced for the current
            // `.lex()` run.
            var lineno_msg = '';

            if (this.yylloc) {
              lineno_msg = ' on line ' + (this.yylineno + 1);
            }

            var p = this.constructLexErrorInfo(
              'Lexical error' + lineno_msg + ': You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).',
              false
            );

            this._signaled_error_token = this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
          }

          return this;
        },

        /**
             * retain first n characters of the match
             * 
             * @public
             * @this {RegExpLexer}
             */
        less: function lexer_less(n) {
          return this.unput(this.match.slice(n));
        },

        /**
             * return (part of the) already matched input, i.e. for error
             * messages.
             * 
             * Limit the returned string length to `maxSize` (default: 20).
             * 
             * Limit the returned string to the `maxLines` number of lines of
             * input (default: 1).
             * 
             * Negative limit values equal *unlimited*.
             * 
             * @public
             * @this {RegExpLexer}
             */
        pastInput: function lexer_pastInput(maxSize, maxLines) {
          var past = this.matched.substring(0, this.matched.length - this.match.length);

          if (maxSize < 0)
            maxSize = past.length;
          else if (!maxSize)
            maxSize = 20;

          if (maxLines < 0)
            maxLines = past.length;         // can't ever have more input lines than this!;
          else if (!maxLines)
            maxLines = 1;

          // `substr` anticipation: treat \r\n as a single character and take a little
          // more than necessary so that we can still properly check against maxSize
          // after we've transformed and limited the newLines in here:
          past = past.substr(-maxSize * 2 - 2);

          // now that we have a significantly reduced string to process, transform the newlines
          // and chop them, then limit them:
          var a = past.replace(/\r\n|\r/g, '\n').split('\n');

          a = a.slice(-maxLines);
          past = a.join('\n');

          // When, after limiting to maxLines, we still have too much to return,
          // do add an ellipsis prefix...
          if (past.length > maxSize) {
            past = '...' + past.substr(-maxSize);
          }

          return past;
        },

        /**
             * return (part of the) upcoming input, i.e. for error messages.
             * 
             * Limit the returned string length to `maxSize` (default: 20).
             * 
             * Limit the returned string to the `maxLines` number of lines of input (default: 1).
             * 
             * Negative limit values equal *unlimited*.
             *
             * > ### NOTE ###
             * >
             * > *"upcoming input"* is defined as the whole of the both
             * > the *currently lexed* input, together with any remaining input
             * > following that. *"currently lexed"* input is the input 
             * > already recognized by the lexer but not yet returned with
             * > the lexer token. This happens when you are invoking this API
             * > from inside any lexer rule action code block. 
             * >
             * 
             * @public
             * @this {RegExpLexer}
             */
        upcomingInput: function lexer_upcomingInput(maxSize, maxLines) {
          var next = this.match;

          if (maxSize < 0)
            maxSize = next.length + this._input.length;
          else if (!maxSize)
            maxSize = 20;

          if (maxLines < 0)
            maxLines = maxSize;         // can't ever have more input lines than this!;
          else if (!maxLines)
            maxLines = 1;

          // `substring` anticipation: treat \r\n as a single character and take a little
          // more than necessary so that we can still properly check against maxSize
          // after we've transformed and limited the newLines in here:
          if (next.length < maxSize * 2 + 2) {
            next += this._input.substring(0, maxSize * 2 + 2);  // substring is faster on Chrome/V8
          }

          // now that we have a significantly reduced string to process, transform the newlines
          // and chop them, then limit them:
          var a = next.replace(/\r\n|\r/g, '\n').split('\n');

          a = a.slice(0, maxLines);
          next = a.join('\n');

          // When, after limiting to maxLines, we still have too much to return,
          // do add an ellipsis postfix...
          if (next.length > maxSize) {
            next = next.substring(0, maxSize) + '...';
          }

          return next;
        },

        /**
             * return a string which displays the character position where the
             * lexing error occurred, i.e. for error messages
             * 
             * @public
             * @this {RegExpLexer}
             */
        showPosition: function lexer_showPosition(maxPrefix, maxPostfix) {
          var pre = this.pastInput(maxPrefix).replace(/\s/g, ' ');
          var c = new Array(pre.length + 1).join('-');
          return pre + this.upcomingInput(maxPostfix).replace(/\s/g, ' ') + '\n' + c + '^';
        },

        /**
             * return an YYLLOC info object derived off the given context (actual, preceding, following, current).
             * Use this method when the given `actual` location is not guaranteed to exist (i.e. when
             * it MAY be NULL) and you MUST have a valid location info object anyway:
             * then we take the given context of the `preceding` and `following` locations, IFF those are available,
             * and reconstruct the `actual` location info from those.
             * If this fails, the heuristic is to take the `current` location, IFF available.
             * If this fails as well, we assume the sought location is at/around the current lexer position
             * and then produce that one as a response. DO NOTE that these heuristic/derived location info
             * values MAY be inaccurate!
             *
             * NOTE: `deriveLocationInfo()` ALWAYS produces a location info object *copy* of `actual`, not just
             * a *reference* hence all input location objects can be assumed to be 'constant' (function has no side-effects).
             * 
             * @public
             * @this {RegExpLexer}
             */
        deriveLocationInfo: function lexer_deriveYYLLOC(actual, preceding, following, current) {
          var loc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
            range: [0, 0]
          };

          if (actual) {
            loc.first_line = actual.first_line | 0;
            loc.last_line = actual.last_line | 0;
            loc.first_column = actual.first_column | 0;
            loc.last_column = actual.last_column | 0;

            if (actual.range) {
              loc.range[0] = actual.range[0] | 0;
              loc.range[1] = actual.range[1] | 0;
            }
          }

          if (loc.first_line <= 0 || loc.last_line < loc.first_line) {
            // plan B: heuristic using preceding and following:
            if (loc.first_line <= 0 && preceding) {
              loc.first_line = preceding.last_line | 0;
              loc.first_column = preceding.last_column | 0;

              if (preceding.range) {
                loc.range[0] = actual.range[1] | 0;
              }
            }

            if ((loc.last_line <= 0 || loc.last_line < loc.first_line) && following) {
              loc.last_line = following.first_line | 0;
              loc.last_column = following.first_column | 0;

              if (following.range) {
                loc.range[1] = actual.range[0] | 0;
              }
            }

            // plan C?: see if the 'current' location is useful/sane too:
            if (loc.first_line <= 0 && current && (loc.last_line <= 0 || current.last_line <= loc.last_line)) {
              loc.first_line = current.first_line | 0;
              loc.first_column = current.first_column | 0;

              if (current.range) {
                loc.range[0] = current.range[0] | 0;
              }
            }

            if (loc.last_line <= 0 && current && (loc.first_line <= 0 || current.first_line >= loc.first_line)) {
              loc.last_line = current.last_line | 0;
              loc.last_column = current.last_column | 0;

              if (current.range) {
                loc.range[1] = current.range[1] | 0;
              }
            }
          }

          // sanitize: fix last_line BEFORE we fix first_line as we use the 'raw' value of the latter
          // or plan D heuristics to produce a 'sensible' last_line value:
          if (loc.last_line <= 0) {
            if (loc.first_line <= 0) {
              loc.first_line = this.yylloc.first_line;
              loc.last_line = this.yylloc.last_line;
              loc.first_column = this.yylloc.first_column;
              loc.last_column = this.yylloc.last_column;
              loc.range[0] = this.yylloc.range[0];
              loc.range[1] = this.yylloc.range[1];
            } else {
              loc.last_line = this.yylloc.last_line;
              loc.last_column = this.yylloc.last_column;
              loc.range[1] = this.yylloc.range[1];
            }
          }

          if (loc.first_line <= 0) {
            loc.first_line = loc.last_line;
            loc.first_column = 0; // loc.last_column;
            loc.range[1] = loc.range[0];
          }

          if (loc.first_column < 0) {
            loc.first_column = 0;
          }

          if (loc.last_column < 0) {
            loc.last_column = loc.first_column > 0 ? loc.first_column : 80;
          }

          return loc;
        },

        /**
             * return a string which displays the lines & columns of input which are referenced 
             * by the given location info range, plus a few lines of context.
             * 
             * This function pretty-prints the indicated section of the input, with line numbers 
             * and everything!
             * 
             * This function is very useful to provide highly readable error reports, while
             * the location range may be specified in various flexible ways:
             * 
             * - `loc` is the location info object which references the area which should be
             *   displayed and 'marked up': these lines & columns of text are marked up by `^`
             *   characters below each character in the entire input range.
             * 
             * - `context_loc` is the *optional* location info object which instructs this
             *   pretty-printer how much *leading* context should be displayed alongside
             *   the area referenced by `loc`. This can help provide context for the displayed
             *   error, etc.
             * 
             *   When this location info is not provided, a default context of 3 lines is
             *   used.
             * 
             * - `context_loc2` is another *optional* location info object, which serves
             *   a similar purpose to `context_loc`: it specifies the amount of *trailing*
             *   context lines to display in the pretty-print output.
             * 
             *   When this location info is not provided, a default context of 1 line only is
             *   used.
             * 
             * Special Notes:
             * 
             * - when the `loc`-indicated range is very large (about 5 lines or more), then
             *   only the first and last few lines of this block are printed while a
             *   `...continued...` message will be printed between them.
             * 
             *   This serves the purpose of not printing a huge amount of text when the `loc`
             *   range happens to be huge: this way a manageable & readable output results
             *   for arbitrary large ranges.
             * 
             * - this function can display lines of input which whave not yet been lexed.
             *   `prettyPrintRange()` can access the entire input!
             * 
             * @public
             * @this {RegExpLexer}
             */
        prettyPrintRange: function lexer_prettyPrintRange(loc, context_loc, context_loc2) {
          loc = this.deriveLocationInfo(loc, context_loc, context_loc2);
          const CONTEXT = 3;
          const CONTEXT_TAIL = 1;
          const MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT = 2;
          var input = this.matched + this._input;
          var lines = input.split('\n');
          var l0 = Math.max(1, context_loc ? context_loc.first_line : loc.first_line - CONTEXT);
          var l1 = Math.max(1, context_loc2 ? context_loc2.last_line : loc.last_line + CONTEXT_TAIL);
          var lineno_display_width = 1 + Math.log10(l1 | 1) | 0;
          var ws_prefix = new Array(lineno_display_width).join(' ');
          var nonempty_line_indexes = [];

          var rv = lines.slice(l0 - 1, l1 + 1).map(function injectLineNumber(line, index) {
            var lno = index + l0;
            var lno_pfx = (ws_prefix + lno).substr(-lineno_display_width);
            var rv = lno_pfx + ': ' + line;
            var errpfx = new Array(lineno_display_width + 1).join('^');
            var offset = 2 + 1;
            var len = 0;

            if (lno === loc.first_line) {
              offset += loc.first_column;

              len = Math.max(
                2,
                (lno === loc.last_line ? loc.last_column : line.length) - loc.first_column + 1
              );
            } else if (lno === loc.last_line) {
              len = Math.max(2, loc.last_column + 1);
            } else if (lno > loc.first_line && lno < loc.last_line) {
              len = Math.max(2, line.length + 1);
            }

            if (len) {
              var lead = new Array(offset).join('.');
              var mark = new Array(len).join('^');
              rv += '\n' + errpfx + lead + mark;

              if (line.trim().length > 0) {
                nonempty_line_indexes.push(index);
              }
            }

            rv = rv.replace(/\t/g, ' ');
            return rv;
          });

          // now make sure we don't print an overly large amount of error area: limit it 
          // to the top and bottom line count:
          if (nonempty_line_indexes.length > 2 * MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT) {
            var clip_start = nonempty_line_indexes[MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT - 1] + 1;
            var clip_end = nonempty_line_indexes[nonempty_line_indexes.length - MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT] - 1;
            var intermediate_line = new Array(lineno_display_width + 1).join(' ') + '  (...continued...)';
            intermediate_line += '\n' + new Array(lineno_display_width + 1).join('-') + '  (---------------)';
            rv.splice(clip_start, clip_end - clip_start + 1, intermediate_line);
          }

          return rv.join('\n');
        },

        /**
             * helper function, used to produce a human readable description as a string, given
             * the input `yylloc` location object.
             * 
             * Set `display_range_too` to TRUE to include the string character index position(s)
             * in the description if the `yylloc.range` is available.
             * 
             * @public
             * @this {RegExpLexer}
             */
        describeYYLLOC: function lexer_describe_yylloc(yylloc, display_range_too) {
          var l1 = yylloc.first_line;
          var l2 = yylloc.last_line;
          var c1 = yylloc.first_column;
          var c2 = yylloc.last_column;
          var dl = l2 - l1;
          var dc = c2 - c1;
          var rv;

          if (dl === 0) {
            rv = 'line ' + l1 + ', ';

            if (dc <= 1) {
              rv += 'column ' + c1;
            } else {
              rv += 'columns ' + c1 + ' .. ' + c2;
            }
          } else {
            rv = 'lines ' + l1 + '(column ' + c1 + ') .. ' + l2 + '(column ' + c2 + ')';
          }

          if (yylloc.range && display_range_too) {
            var r1 = yylloc.range[0];
            var r2 = yylloc.range[1] - 1;

            if (r2 <= r1) {
              rv += ' {String Offset: ' + r1 + '}';
            } else {
              rv += ' {String Offset range: ' + r1 + ' .. ' + r2 + '}';
            }
          }

          return rv;
        },

        /**
             * test the lexed token: return FALSE when not a match, otherwise return token.
             * 
             * `match` is supposed to be an array coming out of a regex match, i.e. `match[0]`
             * contains the actually matched text string.
             * 
             * Also move the input cursor forward and update the match collectors:
             * 
             * - `yytext`
             * - `yyleng`
             * - `match`
             * - `matches`
             * - `yylloc`
             * - `offset`
             * 
             * @public
             * @this {RegExpLexer}
             */
        test_match: function lexer_test_match(match, indexed_rule) {
          var token, lines, backup, match_str, match_str_len;

          if (this.options.backtrack_lexer) {
            // save context
            backup = {
              yylineno: this.yylineno,

              yylloc: {
                first_line: this.yylloc.first_line,
                last_line: this.yylloc.last_line,
                first_column: this.yylloc.first_column,
                last_column: this.yylloc.last_column,
                range: this.yylloc.range.slice(0)
              },

              yytext: this.yytext,
              match: this.match,
              matches: this.matches,
              matched: this.matched,
              yyleng: this.yyleng,
              offset: this.offset,
              _more: this._more,
              _input: this._input,

              //_signaled_error_token: this._signaled_error_token,
              yy: this.yy,

              conditionStack: this.conditionStack.slice(0),
              done: this.done
            };
          }

          match_str = match[0];
          match_str_len = match_str.length;

          // if (match_str.indexOf('\n') !== -1 || match_str.indexOf('\r') !== -1) {
          lines = match_str.split(/(?:\r\n?|\n)/g);

          if (lines.length > 1) {
            this.yylineno += lines.length - 1;
            this.yylloc.last_line = this.yylineno + 1;
            this.yylloc.last_column = lines[lines.length - 1].length;
          } else {
            this.yylloc.last_column += match_str_len;
          }

          // }
          this.yytext += match_str;

          this.match += match_str;
          this.matched += match_str;
          this.matches = match;
          this.yyleng = this.yytext.length;
          this.yylloc.range[1] += match_str_len;

          // previous lex rules MAY have invoked the `more()` API rather than producing a token:
          // those rules will already have moved this `offset` forward matching their match lengths,
          // hence we must only add our own match length now:
          this.offset += match_str_len;

          this._more = false;
          this._backtrack = false;
          this._input = this._input.slice(match_str_len);

          // calling this method:
          //
          //   function lexer__performAction(yy, yyrulenumber, YY_START) {...}
          token = this.performAction.call(
            this,
            this.yy,
            indexed_rule,
            this.conditionStack[this.conditionStack.length - 1] /* = YY_START */
          );

          // otherwise, when the action codes are all simple return token statements:
          //token = this.simpleCaseActionClusters[indexed_rule];

          if (this.done && this._input) {
            this.done = false;
          }

          if (token) {
            return token;
          } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
              this[k] = backup[k];
            }

            this.__currentRuleSet__ = null;
            return false; // rule action called reject() implying the next rule should be tested instead.
          } else if (this._signaled_error_token) {
            // produce one 'error' token as `.parseError()` in `reject()`
            // did not guarantee a failure signal by throwing an exception!
            token = this._signaled_error_token;

            this._signaled_error_token = false;
            return token;
          }

          return false;
        },

        /**
             * return next match in input
             * 
             * @public
             * @this {RegExpLexer}
             */
        next: function lexer_next() {
          if (this.done) {
            this.clear();
            return this.EOF;
          }

          if (!this._input) {
            this.done = true;
          }

          var token, match, tempMatch, index;

          if (!this._more) {
            this.clear();
          }

          var spec = this.__currentRuleSet__;

          if (!spec) {
            // Update the ruleset cache as we apparently encountered a state change or just started lexing.
            // The cache is set up for fast lookup -- we assume a lexer will switch states much less often than it will
            // invoke the `lex()` token-producing API and related APIs, hence caching the set for direct access helps
            // speed up those activities a tiny bit.
            spec = this.__currentRuleSet__ = this._currentRules();

            // Check whether a *sane* condition has been pushed before: this makes the lexer robust against
            // user-programmer bugs such as https://github.com/zaach/jison-lex/issues/19
            if (!spec || !spec.rules) {
              var lineno_msg = '';

              if (this.options.trackPosition) {
                lineno_msg = ' on line ' + (this.yylineno + 1);
              }

              var p = this.constructLexErrorInfo(
                'Internal lexer engine error' + lineno_msg + ': The lex grammar programmer pushed a non-existing condition name "' + this.topState() + '"; this is a fatal error and should be reported to the application programmer team!',
                false
              );

              // produce one 'error' token until this situation has been resolved, most probably by parse termination!
              return this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
            }
          }

          var rule_ids = spec.rules;
          var regexes = spec.__rule_regexes;
          var len = spec.__rule_count;

          // Note: the arrays are 1-based, while `len` itself is a valid index,
          // hence the non-standard less-or-equal check in the next loop condition!
          for (var i = 1; i <= len; i++) {
            tempMatch = this._input.match(regexes[i]);

            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
              match = tempMatch;
              index = i;

              if (this.options.backtrack_lexer) {
                token = this.test_match(tempMatch, rule_ids[i]);

                if (token !== false) {
                  return token;
                } else if (this._backtrack) {
                  match = undefined;
                  continue; // rule action called reject() implying a rule MISmatch.
                } else {
                  // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                  return false;
                }
              } else if (!this.options.flex) {
                break;
              }
            }
          }

          if (match) {
            token = this.test_match(match, rule_ids[index]);

            if (token !== false) {
              return token;
            }

            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
          }

          if (!this._input) {
            this.done = true;
            this.clear();
            return this.EOF;
          } else {
            var lineno_msg = '';

            if (this.options.trackPosition) {
              lineno_msg = ' on line ' + (this.yylineno + 1);
            }

            var p = this.constructLexErrorInfo(
              'Lexical error' + lineno_msg + ': Unrecognized text.',
              this.options.lexerErrorsAreRecoverable
            );

            var pendingInput = this._input;
            var activeCondition = this.topState();
            var conditionStackDepth = this.conditionStack.length;
            token = this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;

            if (token === this.ERROR) {
              // we can try to recover from a lexer error that `parseError()` did not 'recover' for us
              // by moving forward at least one character at a time IFF the (user-specified?) `parseError()`
              // has not consumed/modified any pending input or changed state in the error handler:
              if (!this.matches && // and make sure the input has been modified/consumed ...
              pendingInput === this._input && // ...or the lexer state has been modified significantly enough
              // to merit a non-consuming error handling action right now.
              activeCondition === this.topState() && conditionStackDepth === this.conditionStack.length) {
                this.input();
              }
            }

            return token;
          }
        },

        /**
             * return next match that has a token
             * 
             * @public
             * @this {RegExpLexer}
             */
        lex: function lexer_lex() {
          var r;

          // allow the PRE/POST handlers set/modify the return token for maximum flexibility of the generated lexer:
          if (typeof this.pre_lex === 'function') {
            r = this.pre_lex.call(this, 0);
          }

          if (typeof this.options.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.pre_lex.call(this, r) || r;
          }

          if (this.yy && typeof this.yy.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.pre_lex.call(this, r) || r;
          }

          while (!r) {
            r = this.next();
          }

          if (this.yy && typeof this.yy.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.post_lex.call(this, r) || r;
          }

          if (typeof this.options.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.post_lex.call(this, r) || r;
          }

          if (typeof this.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.post_lex.call(this, r) || r;
          }

          return r;
        },

        /**
             * return next match that has a token. Identical to the `lex()` API but does not invoke any of the 
             * `pre_lex()` nor any of the `post_lex()` callbacks.
             * 
             * @public
             * @this {RegExpLexer}
             */
        fastLex: function lexer_fastLex() {
          var r;

          while (!r) {
            r = this.next();
          }

          return r;
        },

        /**
             * return info about the lexer state that can help a parser or other lexer API user to use the
             * most efficient means available. This API is provided to aid run-time performance for larger
             * systems which employ this lexer.
             * 
             * @public
             * @this {RegExpLexer}
             */
        canIUse: function lexer_canIUse() {
          var rv = {
            fastLex: !(typeof this.pre_lex === 'function' || typeof this.options.pre_lex === 'function' || this.yy && typeof this.yy.pre_lex === 'function' || this.yy && typeof this.yy.post_lex === 'function' || typeof this.options.post_lex === 'function' || typeof this.post_lex === 'function') && typeof this.fastLex === 'function'
          };

          return rv;
        },

        /**
             * backwards compatible alias for `pushState()`;
             * the latter is symmetrical with `popState()` and we advise to use
             * those APIs in any modern lexer code, rather than `begin()`.
             * 
             * @public
             * @this {RegExpLexer}
             */
        begin: function lexer_begin(condition) {
          return this.pushState(condition);
        },

        /**
             * activates a new lexer condition state (pushes the new lexer
             * condition state onto the condition stack)
             * 
             * @public
             * @this {RegExpLexer}
             */
        pushState: function lexer_pushState(condition) {
          this.conditionStack.push(condition);
          this.__currentRuleSet__ = null;
          return this;
        },

        /**
             * pop the previously active lexer condition state off the condition
             * stack
             * 
             * @public
             * @this {RegExpLexer}
             */
        popState: function lexer_popState() {
          var n = this.conditionStack.length - 1;

          if (n > 0) {
            this.__currentRuleSet__ = null;
            return this.conditionStack.pop();
          } else {
            return this.conditionStack[0];
          }
        },

        /**
             * return the currently active lexer condition state; when an index
             * argument is provided it produces the N-th previous condition state,
             * if available
             * 
             * @public
             * @this {RegExpLexer}
             */
        topState: function lexer_topState(n) {
          n = this.conditionStack.length - 1 - Math.abs(n || 0);

          if (n >= 0) {
            return this.conditionStack[n];
          } else {
            return 'INITIAL';
          }
        },

        /**
             * (internal) determine the lexer rule set which is active for the
             * currently active lexer condition state
             * 
             * @public
             * @this {RegExpLexer}
             */
        _currentRules: function lexer__currentRules() {
          if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]];
          } else {
            return this.conditions['INITIAL'];
          }
        },

        /**
             * return the number of states currently on the stack
             * 
             * @public
             * @this {RegExpLexer}
             */
        stateStackSize: function lexer_stateStackSize() {
          return this.conditionStack.length;
        },

        options: {
          xregexp: true,
          ranges: true,
          trackPosition: true,
          easy_keyword_rules: true
        },

        JisonLexerError: JisonLexerError,

        performAction: function lexer__performAction(yy, yyrulenumber, YY_START) {
          var yy_ = this;

          switch (yyrulenumber) {
          case 2:
            /*! Conditions:: action */
            /*! Rule::       \/[^ /]*?['"{}][^ ]*?\/ */
            return 43; // regexp with braces or quotes (and no spaces) 
          case 7:
            /*! Conditions:: action */
            /*! Rule::       \{ */
            yy.depth++;

            return 12;
          case 8:
            /*! Conditions:: action */
            /*! Rule::       \} */
            if (yy.depth === 0) {
              this.popState();
            } else {
              yy.depth--;
            }

            return 13;
          case 9:
            /*! Conditions:: token */
            /*! Rule::       {BR} */
            this.popState();

            break;
          case 10:
            /*! Conditions:: token */
            /*! Rule::       %% */
            this.popState();

            break;
          case 11:
            /*! Conditions:: token */
            /*! Rule::       ; */
            this.popState();

            break;
          case 12:
            /*! Conditions:: bnf ebnf */
            /*! Rule::       %% */
            this.pushState('code');

            return 14;
          case 25:
            /*! Conditions:: options */
            /*! Rule::       = */
            this.pushState('option_values');

            return 3;
          case 26:
            /*! Conditions:: option_values */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 29;   // value is always a string type 
          case 27:
            /*! Conditions:: option_values */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 29;   // value is always a string type 
          case 28:
            /*! Conditions:: option_values */
            /*! Rule::       `{ES2017_STRING_CONTENT}` */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 29;   // value is always a string type 
          case 29:
            /*! Conditions:: INITIAL ebnf bnf token path options option_values */
            /*! Rule::       \/\/[^\r\n]* */
            /* skip single-line comment */
            break;
          case 30:
            /*! Conditions:: INITIAL ebnf bnf token path options option_values */
            /*! Rule::       \/\*[^]*?\*\/ */
            /* skip multi-line comment */
            break;
          case 31:
            /*! Conditions:: option_values */
            /*! Rule::       [^\s\r\n]+ */
            this.popState();

            return 30;
          case 32:
            /*! Conditions:: options */
            /*! Rule::       {BR}{WS}+(?=\S) */
            /* skip leading whitespace on the next line of input, when followed by more options */
            break;
          case 33:
            /*! Conditions:: options */
            /*! Rule::       {BR} */
            this.popState();

            return 28;
          case 34:
            /*! Conditions:: options option_values */
            /*! Rule::       {WS}+ */
            /* skip whitespace */
            break;
          case 35:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       {WS}+ */
            /* skip whitespace */
            break;
          case 36:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       {BR}+ */
            /* skip newlines */
            break;
          case 37:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       \[{ID}\] */
            yy_.yytext = this.matches[1];

            return 39;
          case 42:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy_.yytext = unescQuote(this.matches[1]);

            return 26;
          case 43:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy_.yytext = unescQuote(this.matches[1]);

            return 26;
          case 48:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %% */
            this.pushState(yy.ebnf ? 'ebnf' : 'bnf');

            return 14;
          case 49:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %ebnf\b */
            yy.ebnf = true;

            return 20;
          case 57:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %token\b */
            this.pushState('token');

            return 18;
          case 59:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %option[s]? */
            this.pushState('options');

            return 27;
          case 60:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %lex{LEX_CONTENT}\/lex\b */
            // remove the %lex../lex wrapper and return the pure lex section:
            yy_.yytext = this.matches[1];

            return 17;
          case 63:
            /*! Conditions:: INITIAL ebnf bnf code */
            /*! Rule::       %include\b */
            this.pushState('path');

            return 44;
          case 64:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %{NAME}([^\r\n]*) */
            /* ignore unrecognized decl */
            this.warn(rmCommonWS`
                                                EBNF: ignoring unsupported parser option ${dquote(yy_.yytext)}
                                                while lexing in ${dquote(this.topState())} state.

                                                  Erroneous area:
                                                ` + this.prettyPrintRange(yy_.yylloc));

            yy_.yytext = [// {NAME}
            this.matches[1], // optional value/parameters
            this.matches[2].trim()];

            return 21;
          case 65:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       <{ID}> */
            yy_.yytext = this.matches[1];

            return 36;
          case 66:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       \{\{([^]*?)\}\} */
            yy_.yytext = this.matches[1].replace(/\}\\\}/g, '}}');  // unescape any literal '}\}' that exists within the action code block

            return 15;
          case 67:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       %\{([^]*?)%\} */
            yy_.yytext = this.matches[1].replace(/%\\\}/g, '%}');   // unescape any literal '%\}' that exists within the action code block

            return 15;
          case 68:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       \{ */
            yy.depth = 0;

            this.pushState('action');
            return 12;
          case 69:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       ->.* */
            yy_.yytext = yy_.yytext.substr(2, yy_.yyleng - 2).trim();

            return 42;
          case 70:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       →.* */
            yy_.yytext = yy_.yytext.substr(1, yy_.yyleng - 1).trim();

            return 42;
          case 71:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       =>.* */
            yy_.yytext = yy_.yytext.substr(2, yy_.yyleng - 2).trim();

            return 42;
          case 72:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       {HEX_NUMBER} */
            yy_.yytext = parseInt(yy_.yytext, 16);

            return 37;
          case 73:
            /*! Conditions:: token bnf ebnf INITIAL */
            /*! Rule::       {DECIMAL_NUMBER}(?![xX0-9a-fA-F]) */
            yy_.yytext = parseInt(yy_.yytext, 10);

            return 37;
          case 75:
            /*! Conditions:: code */
            /*! Rule::       [^\r\n]+ */
            return 46;      // the bit of CODE just before EOF... 
          case 76:
            /*! Conditions:: path */
            /*! Rule::       {BR} */
            this.popState();

            this.unput(yy_.yytext);
            break;
          case 77:
            /*! Conditions:: path */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 45;
          case 78:
            /*! Conditions:: path */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 45;
          case 79:
            /*! Conditions:: path */
            /*! Rule::       {WS}+ */
            // skip whitespace in the line 
            break;
          case 80:
            /*! Conditions:: path */
            /*! Rule::       [^\s\r\n]+ */
            this.popState();

            return 45;
          case 81:
            /*! Conditions:: action */
            /*! Rule::       " */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 82:
            /*! Conditions:: action */
            /*! Rule::       ' */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 83:
            /*! Conditions:: action */
            /*! Rule::       ` */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 84:
            /*! Conditions:: option_values */
            /*! Rule::       " */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 85:
            /*! Conditions:: option_values */
            /*! Rule::       ' */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 86:
            /*! Conditions:: option_values */
            /*! Rule::       ` */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 87:
            /*! Conditions:: * */
            /*! Rule::       " */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                            unterminated string constant  encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 88:
            /*! Conditions:: * */
            /*! Rule::       ' */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                            unterminated string constant  encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 89:
            /*! Conditions:: * */
            /*! Rule::       ` */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                            unterminated string constant  encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 90:
            /*! Conditions:: * */
            /*! Rule::       . */
            /* b0rk on bad characters */
            yy_.yyerror(rmCommonWS`
                                                unsupported parser input: ${dquote(yy_.yytext)}
                                                while lexing in ${dquote(this.topState())} state.
                                                
                                                  Erroneous area:
                                                ` + this.prettyPrintRange(yy_.yylloc));

            break;
          default:
            return this.simpleCaseActionClusters[yyrulenumber];
          }
        },

        simpleCaseActionClusters: {
          /*! Conditions:: action */
          /*! Rule::       \/\*[^]*?\*\/ */
          0: 43,

          /*! Conditions:: action */
          /*! Rule::       \/\/[^\r\n]* */
          1: 43,

          /*! Conditions:: action */
          /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
          3: 43,

          /*! Conditions:: action */
          /*! Rule::       '{QUOTED_STRING_CONTENT}' */
          4: 43,

          /*! Conditions:: action */
          /*! Rule::       [/"'][^{}/"']+ */
          5: 43,

          /*! Conditions:: action */
          /*! Rule::       [^{}/"']+ */
          6: 43,

          /*! Conditions:: bnf ebnf */
          /*! Rule::       %empty\b */
          13: 38,

          /*! Conditions:: bnf ebnf */
          /*! Rule::       %epsilon\b */
          14: 38,

          /*! Conditions:: bnf ebnf */
          /*! Rule::       \u0190 */
          15: 38,

          /*! Conditions:: bnf ebnf */
          /*! Rule::       \u025B */
          16: 38,

          /*! Conditions:: bnf ebnf */
          /*! Rule::       \u03B5 */
          17: 38,

          /*! Conditions:: bnf ebnf */
          /*! Rule::       \u03F5 */
          18: 38,

          /*! Conditions:: ebnf */
          /*! Rule::       \( */
          19: 7,

          /*! Conditions:: ebnf */
          /*! Rule::       \) */
          20: 8,

          /*! Conditions:: ebnf */
          /*! Rule::       \* */
          21: 9,

          /*! Conditions:: ebnf */
          /*! Rule::       \? */
          22: 10,

          /*! Conditions:: ebnf */
          /*! Rule::       \+ */
          23: 11,

          /*! Conditions:: options */
          /*! Rule::       {NAME} */
          24: 25,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       {ID} */
          38: 24,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       {NAME} */
          39: 25,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       \$end\b */
          40: 40,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       \$eof\b */
          41: 40,

          /*! Conditions:: token */
          /*! Rule::       [^\s\r\n]+ */
          44: 'TOKEN_WORD',

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       : */
          45: 5,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       ; */
          46: 4,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       \| */
          47: 6,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %debug\b */
          50: 19,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %parser-type\b */
          51: 32,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %prec\b */
          52: 41,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %start\b */
          53: 16,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %left\b */
          54: 33,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %right\b */
          55: 34,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %nonassoc\b */
          56: 35,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %parse-param[s]? */
          58: 31,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %code\b */
          61: 23,

          /*! Conditions:: token bnf ebnf INITIAL */
          /*! Rule::       %import\b */
          62: 22,

          /*! Conditions:: code */
          /*! Rule::       [^\r\n]*(\r|\n)+ */
          74: 46,

          /*! Conditions:: * */
          /*! Rule::       $ */
          91: 1
        },

        rules: [
          /*  0: */  /^(?:\/\*[\s\S]*?\*\/)/,
          /*  1: */  /^(?:\/\/[^\r\n]*)/,
          /*  2: */  /^(?:\/[^ /]*?['"{}][^ ]*?\/)/,
          /*  3: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /*  4: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /*  5: */  /^(?:[/"'][^{}/"']+)/,
          /*  6: */  /^(?:[^{}/"']+)/,
          /*  7: */  /^(?:\{)/,
          /*  8: */  /^(?:\})/,
          /*  9: */  /^(?:(\r\n|\n|\r))/,
          /* 10: */  /^(?:%%)/,
          /* 11: */  /^(?:;)/,
          /* 12: */  /^(?:%%)/,
          /* 13: */  /^(?:%empty\b)/,
          /* 14: */  /^(?:%epsilon\b)/,
          /* 15: */  /^(?:\u0190)/,
          /* 16: */  /^(?:\u025B)/,
          /* 17: */  /^(?:\u03B5)/,
          /* 18: */  /^(?:\u03F5)/,
          /* 19: */  /^(?:\()/,
          /* 20: */  /^(?:\))/,
          /* 21: */  /^(?:\*)/,
          /* 22: */  /^(?:\?)/,
          /* 23: */  /^(?:\+)/,
          /* 24: */  new XRegExp__default['default'](
            '^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}\\-_]*(?:[\\p{Alphabetic}\\p{Number}_]))?))',
            ''
          ),
          /* 25: */  /^(?:=)/,
          /* 26: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /* 27: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /* 28: */  /^(?:`((?:\\`|\\[^`]|[^\\`])*)`)/,
          /* 29: */  /^(?:\/\/[^\r\n]*)/,
          /* 30: */  /^(?:\/\*[\s\S]*?\*\/)/,
          /* 31: */  /^(?:\S+)/,
          /* 32: */  /^(?:(\r\n|\n|\r)([^\S\n\r])+(?=\S))/,
          /* 33: */  /^(?:(\r\n|\n|\r))/,
          /* 34: */  /^(?:([^\S\n\r])+)/,
          /* 35: */  /^(?:([^\S\n\r])+)/,
          /* 36: */  /^(?:(\r\n|\n|\r)+)/,
          /* 37: */  new XRegExp__default['default']('^(?:\\[([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*)\\])', ''),
          /* 38: */  new XRegExp__default['default']('^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*))', ''),
          /* 39: */  new XRegExp__default['default'](
            '^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}\\-_]*(?:[\\p{Alphabetic}\\p{Number}_]))?))',
            ''
          ),
          /* 40: */  /^(?:\$end\b)/,
          /* 41: */  /^(?:\$eof\b)/,
          /* 42: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /* 43: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /* 44: */  /^(?:\S+)/,
          /* 45: */  /^(?::)/,
          /* 46: */  /^(?:;)/,
          /* 47: */  /^(?:\|)/,
          /* 48: */  /^(?:%%)/,
          /* 49: */  /^(?:%ebnf\b)/,
          /* 50: */  /^(?:%debug\b)/,
          /* 51: */  /^(?:%parser-type\b)/,
          /* 52: */  /^(?:%prec\b)/,
          /* 53: */  /^(?:%start\b)/,
          /* 54: */  /^(?:%left\b)/,
          /* 55: */  /^(?:%right\b)/,
          /* 56: */  /^(?:%nonassoc\b)/,
          /* 57: */  /^(?:%token\b)/,
          /* 58: */  /^(?:%parse-param[s]?)/,
          /* 59: */  /^(?:%option[s]?)/,
          /* 60: */  /^(?:%lex((?:[^\S\n\r])*(?:(?:\r\n|\n|\r)[\s\S]*?)?(?:\r\n|\n|\r)(?:[^\S\n\r])*)\/lex\b)/,
          /* 61: */  /^(?:%code\b)/,
          /* 62: */  /^(?:%import\b)/,
          /* 63: */  /^(?:%include\b)/,
          /* 64: */  new XRegExp__default['default'](
            '^(?:%([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}\\-_]*(?:[\\p{Alphabetic}\\p{Number}_]))?)([^\\n\\r]*))',
            ''
          ),
          /* 65: */  new XRegExp__default['default']('^(?:<([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*)>)', ''),
          /* 66: */  /^(?:\{\{([\s\S]*?)\}\})/,
          /* 67: */  /^(?:%\{([\s\S]*?)%\})/,
          /* 68: */  /^(?:\{)/,
          /* 69: */  /^(?:->.*)/,
          /* 70: */  /^(?:→.*)/,
          /* 71: */  /^(?:=>.*)/,
          /* 72: */  /^(?:(0[Xx][\dA-Fa-f]+))/,
          /* 73: */  /^(?:([1-9]\d*)(?![\dA-FXa-fx]))/,
          /* 74: */  /^(?:[^\r\n]*(\r|\n)+)/,
          /* 75: */  /^(?:[^\r\n]+)/,
          /* 76: */  /^(?:(\r\n|\n|\r))/,
          /* 77: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /* 78: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /* 79: */  /^(?:([^\S\n\r])+)/,
          /* 80: */  /^(?:\S+)/,
          /* 81: */  /^(?:")/,
          /* 82: */  /^(?:')/,
          /* 83: */  /^(?:`)/,
          /* 84: */  /^(?:")/,
          /* 85: */  /^(?:')/,
          /* 86: */  /^(?:`)/,
          /* 87: */  /^(?:")/,
          /* 88: */  /^(?:')/,
          /* 89: */  /^(?:`)/,
          /* 90: */  /^(?:.)/,
          /* 91: */  /^(?:$)/
        ],

        conditions: {
          'action': {
            rules: [0, 1, 2, 3, 4, 5, 6, 7, 8, 81, 82, 83, 87, 88, 89, 90, 91],
            inclusive: false
          },

          'code': {
            rules: [63, 74, 75, 87, 88, 89, 90, 91],
            inclusive: false
          },

          'path': {
            rules: [29, 30, 76, 77, 78, 79, 80, 87, 88, 89, 90, 91],
            inclusive: false
          },

          'options': {
            rules: [24, 25, 29, 30, 32, 33, 34, 87, 88, 89, 90, 91],
            inclusive: false
          },

          'option_values': {
            rules: [26, 27, 28, 29, 30, 31, 34, 84, 85, 86, 87, 88, 89, 90, 91],
            inclusive: false
          },

          'token': {
            rules: [
              9,
              10,
              11,
              29,
              30,
              35,
              36,
              37,
              38,
              39,
              40,
              41,
              42,
              43,
              44,
              45,
              46,
              47,
              48,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              87,
              88,
              89,
              90,
              91
            ],

            inclusive: true
          },

          'bnf': {
            rules: [
              12,
              13,
              14,
              15,
              16,
              17,
              18,
              29,
              30,
              35,
              36,
              37,
              38,
              39,
              40,
              41,
              42,
              43,
              45,
              46,
              47,
              48,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              87,
              88,
              89,
              90,
              91
            ],

            inclusive: true
          },

          'ebnf': {
            rules: [
              12,
              13,
              14,
              15,
              16,
              17,
              18,
              19,
              20,
              21,
              22,
              23,
              29,
              30,
              35,
              36,
              37,
              38,
              39,
              40,
              41,
              42,
              43,
              45,
              46,
              47,
              48,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              87,
              88,
              89,
              90,
              91
            ],

            inclusive: true
          },

          'INITIAL': {
            rules: [
              29,
              30,
              35,
              36,
              37,
              38,
              39,
              40,
              41,
              42,
              43,
              45,
              46,
              47,
              48,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              87,
              88,
              89,
              90,
              91
            ],

            inclusive: true
          }
        }
      };

      var rmCommonWS = helpers.rmCommonWS;
      var dquote = helpers.dquote;

      // unescape a string value which is wrapped in quotes/doublequotes
      function unescQuote(str) {
        str = '' + str;
        var a = str.split('\\\\');

        a = a.map(function(s) {
          return s.replace(/\\'/g, '\'').replace(/\\"/g, '"');
        });

        str = a.join('\\\\');
        return str;
      }

      lexer.warn = function l_warn() {
        if (this.yy && this.yy.parser && typeof this.yy.parser.warn === 'function') {
          return this.yy.parser.warn.apply(this, arguments);
        } else {
          console.warn.apply(console, arguments);
        }
      };

      lexer.log = function l_log() {
        if (this.yy && this.yy.parser && typeof this.yy.parser.log === 'function') {
          return this.yy.parser.log.apply(this, arguments);
        } else {
          console.log.apply(console, arguments);
        }
      };

      return lexer;
    }();
    parser$2.lexer = lexer$1;

    var ebnf = false;



    var rmCommonWS$1 = helpers.rmCommonWS;
    var dquote$1 = helpers.dquote;
    var checkActionBlock$1 = helpers.checkActionBlock;


    // transform ebnf to bnf if necessary
    function extend(json, grammar) {
        if (ebnf) {
            json.ebnf = grammar.grammar;        // keep the original source EBNF around for possible pretty-printing & AST exports.
            json.bnf = transform(grammar.grammar);
        }
        else {
            json.bnf = grammar.grammar;
        }
        if (grammar.actionInclude) {
            json.actionInclude = grammar.actionInclude;
        }
        return json;
    }

    // convert string value to number or boolean value, when possible
    // (and when this is more or less obviously the intent)
    // otherwise produce the string itself as value.
    function parseValue(v) {
        if (v === 'false') {
            return false;
        }
        if (v === 'true') {
            return true;
        }
        // http://stackoverflow.com/questions/175739/is-there-a-built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
        // Note that the `v` check ensures that we do not convert `undefined`, `null` and `''` (empty string!)
        if (v && !isNaN(v)) {
            var rv = +v;
            if (isFinite(rv)) {
                return rv;
            }
        }
        return v;
    }


    parser$2.warn = function p_warn() {
        console.warn.apply(console, arguments);
    };

    parser$2.log = function p_log() {
        console.log.apply(console, arguments);
    };


    function Parser$1() {
        this.yy = {};
    }
    Parser$1.prototype = parser$2;
    parser$2.Parser = Parser$1;

    function yyparse$1() {
        return parser$2.parse.apply(parser$2, arguments);
    }



    var bnf = {
        parser: parser$2,
        Parser: Parser$1,
        parse: yyparse$1,
        
    };

    // See also:
    // http://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/#35881508
    // but we keep the prototype.constructor and prototype.name assignment lines too for compatibility
    // with userland code which might access the derived class in a 'classic' way.
    function JisonParserError$2(msg, hash) {

        Object.defineProperty(this, 'name', {
            enumerable: false,
            writable: false,
            value: 'JisonParserError'
        });

        if (msg == null) msg = '???';

        Object.defineProperty(this, 'message', {
            enumerable: false,
            writable: true,
            value: msg
        });

        this.hash = hash;

        var stacktrace;
        if (hash && hash.exception instanceof Error) {
            var ex2 = hash.exception;
            this.message = ex2.message || msg;
            stacktrace = ex2.stack;
        }
        if (!stacktrace) {
            if (Error.hasOwnProperty('captureStackTrace')) {        // V8/Chrome engine
                Error.captureStackTrace(this, this.constructor);
            } else {
                stacktrace = (new Error(msg)).stack;
            }
        }
        if (stacktrace) {
            Object.defineProperty(this, 'stack', {
                enumerable: false,
                writable: false,
                value: stacktrace
            });
        }
    }

    if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(JisonParserError$2.prototype, Error.prototype);
    } else {
        JisonParserError$2.prototype = Object.create(Error.prototype);
    }
    JisonParserError$2.prototype.constructor = JisonParserError$2;
    JisonParserError$2.prototype.name = 'JisonParserError';




            // helper: reconstruct the productions[] table
            function bp$2(s) {
                var rv = [];
                var p = s.pop;
                var r = s.rule;
                for (var i = 0, l = p.length; i < l; i++) {
                    rv.push([
                        p[i],
                        r[i]
                    ]);
                }
                return rv;
            }
        


            // helper: reconstruct the defaultActions[] table
            function bda$1(s) {
                var rv = {};
                var d = s.idx;
                var g = s.goto;
                for (var i = 0, l = d.length; i < l; i++) {
                    var j = d[i];
                    rv[j] = g[i];
                }
                return rv;
            }
        


            // helper: reconstruct the 'goto' table
            function bt$2(s) {
                var rv = [];
                var d = s.len;
                var y = s.symbol;
                var t = s.type;
                var a = s.state;
                var m = s.mode;
                var g = s.goto;
                for (var i = 0, l = d.length; i < l; i++) {
                    var n = d[i];
                    var q = {};
                    for (var j = 0; j < n; j++) {
                        var z = y.shift();
                        switch (t.shift()) {
                        case 2:
                            q[z] = [
                                m.shift(),
                                g.shift()
                            ];
                            break;

                        case 0:
                            q[z] = a.shift();
                            break;

                        default:
                            // type === 1: accept
                            q[z] = [
                                3
                            ];
                        }
                    }
                    rv.push(q);
                }
                return rv;
            }
        


            // helper: runlength encoding with increment step: code, length: step (default step = 0)
            // `this` references an array
            function s$2(c, l, a) {
                a = a || 0;
                for (var i = 0; i < l; i++) {
                    this.push(c);
                    c += a;
                }
            }

            // helper: duplicate sequence from *relative* offset and length.
            // `this` references an array
            function c$2(i, l) {
                i = this.length - i;
                for (l += i; i < l; i++) {
                    this.push(this[i]);
                }
            }

            // helper: unpack an array using helpers and data, all passed in an array argument 'a'.
            function u$2(a) {
                var rv = [];
                for (var i = 0, l = a.length; i < l; i++) {
                    var e = a[i];
                    // Is this entry a helper function?
                    if (typeof e === 'function') {
                        i++;
                        e.apply(rv, a[i]);
                    } else {
                        rv.push(e);
                    }
                }
                return rv;
            }
        

    var parser$3 = {
        // Code Generator Information Report
        // ---------------------------------
        //
        // Options:
        //
        //   default action mode: ............. ["classic","merge"]
        //   test-compile action mode: ........ "parser:*,lexer:*"
        //   try..catch: ...................... true
        //   default resolve on conflict: ..... true
        //   on-demand look-ahead: ............ false
        //   error recovery token skip maximum: 3
        //   yyerror in parse actions is: ..... NOT recoverable,
        //   yyerror in lexer actions and other non-fatal lexer are:
        //   .................................. NOT recoverable,
        //   debug grammar/output: ............ false
        //   has partial LR conflict upgrade:   true
        //   rudimentary token-stack support:   false
        //   parser table compression mode: ... 2
        //   export debug tables: ............. false
        //   export *all* tables: ............. false
        //   module type: ..................... es
        //   parser engine type: .............. lalr
        //   output main() in the module: ..... true
        //   has user-specified main(): ....... false
        //   has user-specified require()/import modules for main():
        //   .................................. false
        //   number of expected conflicts: .... 0
        //
        //
        // Parser Analysis flags:
        //
        //   no significant actions (parser is a language matcher only):
        //   .................................. false
        //   uses yyleng: ..................... false
        //   uses yylineno: ................... false
        //   uses yytext: ..................... false
        //   uses yylloc: ..................... false
        //   uses ParseError API: ............. false
        //   uses YYERROR: .................... true
        //   uses YYRECOVERING: ............... false
        //   uses YYERROK: .................... false
        //   uses YYCLEARIN: .................. false
        //   tracks rule values: .............. true
        //   assigns rule values: ............. true
        //   uses location tracking: .......... true
        //   assigns location: ................ true
        //   uses yystack: .................... false
        //   uses yysstack: ................... false
        //   uses yysp: ....................... true
        //   uses yyrulelength: ............... false
        //   uses yyMergeLocationInfo API: .... true
        //   has error recovery: .............. true
        //   has error reporting: ............. true
        //
        // --------- END OF REPORT -----------

    trace: function no_op_trace() { },
    JisonParserError: JisonParserError$2,
    yy: {},
    options: {
      type: "lalr",
      hasPartialLrUpgradeOnConflict: true,
      errorRecoveryTokenDiscardCount: 3
    },
    symbols_: {
      "$": 17,
      "$accept": 0,
      "$end": 1,
      "%%": 19,
      "(": 10,
      ")": 11,
      "*": 7,
      "+": 12,
      ",": 8,
      ".": 15,
      "/": 14,
      "/!": 39,
      "<": 5,
      "=": 18,
      ">": 6,
      "?": 13,
      "ACTION": 32,
      "ACTION_BODY": 33,
      "ACTION_BODY_CPP_COMMENT": 35,
      "ACTION_BODY_C_COMMENT": 34,
      "ACTION_BODY_WHITESPACE": 36,
      "ACTION_END": 31,
      "ACTION_START": 28,
      "BRACKET_MISSING": 29,
      "BRACKET_SURPLUS": 30,
      "CHARACTER_LIT": 46,
      "CODE": 53,
      "EOF": 1,
      "ESCAPE_CHAR": 44,
      "IMPORT": 24,
      "INCLUDE": 51,
      "INCLUDE_PLACEMENT_ERROR": 37,
      "INIT_CODE": 25,
      "NAME": 20,
      "NAME_BRACE": 40,
      "OPTIONS": 47,
      "OPTIONS_END": 48,
      "OPTION_STRING_VALUE": 49,
      "OPTION_VALUE": 50,
      "PATH": 52,
      "RANGE_REGEX": 45,
      "REGEX_SET": 43,
      "REGEX_SET_END": 42,
      "REGEX_SET_START": 41,
      "SPECIAL_GROUP": 38,
      "START_COND": 27,
      "START_EXC": 22,
      "START_INC": 21,
      "STRING_LIT": 26,
      "UNKNOWN_DECL": 23,
      "^": 16,
      "action": 68,
      "action_body": 69,
      "any_group_regex": 78,
      "definition": 58,
      "definitions": 57,
      "error": 2,
      "escape_char": 81,
      "extra_lexer_module_code": 87,
      "import_name": 60,
      "import_path": 61,
      "include_macro_code": 88,
      "init": 56,
      "init_code_name": 59,
      "lex": 54,
      "module_code_chunk": 89,
      "name_expansion": 77,
      "name_list": 71,
      "names_exclusive": 63,
      "names_inclusive": 62,
      "nonempty_regex_list": 74,
      "option": 86,
      "option_list": 85,
      "optional_module_code_chunk": 90,
      "options": 84,
      "range_regex": 82,
      "regex": 72,
      "regex_base": 76,
      "regex_concat": 75,
      "regex_list": 73,
      "regex_set": 79,
      "regex_set_atom": 80,
      "rule": 67,
      "rule_block": 66,
      "rules": 64,
      "rules_and_epilogue": 55,
      "rules_collective": 65,
      "start_conditions": 70,
      "string": 83,
      "{": 3,
      "|": 9,
      "}": 4
    },
    terminals_: {
      1: "EOF",
      2: "error",
      3: "{",
      4: "}",
      5: "<",
      6: ">",
      7: "*",
      8: ",",
      9: "|",
      10: "(",
      11: ")",
      12: "+",
      13: "?",
      14: "/",
      15: ".",
      16: "^",
      17: "$",
      18: "=",
      19: "%%",
      20: "NAME",
      21: "START_INC",
      22: "START_EXC",
      23: "UNKNOWN_DECL",
      24: "IMPORT",
      25: "INIT_CODE",
      26: "STRING_LIT",
      27: "START_COND",
      28: "ACTION_START",
      29: "BRACKET_MISSING",
      30: "BRACKET_SURPLUS",
      31: "ACTION_END",
      32: "ACTION",
      33: "ACTION_BODY",
      34: "ACTION_BODY_C_COMMENT",
      35: "ACTION_BODY_CPP_COMMENT",
      36: "ACTION_BODY_WHITESPACE",
      37: "INCLUDE_PLACEMENT_ERROR",
      38: "SPECIAL_GROUP",
      39: "/!",
      40: "NAME_BRACE",
      41: "REGEX_SET_START",
      42: "REGEX_SET_END",
      43: "REGEX_SET",
      44: "ESCAPE_CHAR",
      45: "RANGE_REGEX",
      46: "CHARACTER_LIT",
      47: "OPTIONS",
      48: "OPTIONS_END",
      49: "OPTION_STRING_VALUE",
      50: "OPTION_VALUE",
      51: "INCLUDE",
      52: "PATH",
      53: "CODE"
    },
    TERROR: 2,
        EOF: 1,

        // internals: defined here so the object *structure* doesn't get modified by parse() et al,
        // thus helping JIT compilers like Chrome V8.
        originalQuoteName: null,
        originalParseError: null,
        cleanupAfterParse: null,
        constructParseErrorInfo: null,
        yyMergeLocationInfo: null,
        copy_yytext: null,
        copy_yylloc: null,

        __reentrant_call_depth: 0,      // INTERNAL USE ONLY
        __error_infos: [],              // INTERNAL USE ONLY: the set of parseErrorInfo objects created since the last cleanup
        __error_recovery_infos: [],     // INTERNAL USE ONLY: the set of parseErrorInfo objects created since the last cleanup

        // APIs which will be set up depending on user action code analysis:
        //yyRecovering: 0,
        //yyErrOk: 0,
        //yyClearIn: 0,

        // Helper APIs
        // -----------

        // Helper function which can be overridden by user code later on: put suitable quotes around
        // literal IDs in a description string.
        quoteName: function parser_quoteName(id_str) {

            return '"' + id_str + '"';
        },

        // Return the name of the given symbol (terminal or non-terminal) as a string, when available.
        //
        // Return NULL when the symbol is unknown to the parser.
        getSymbolName: function parser_getSymbolName(symbol) {

            if (this.terminals_[symbol]) {
                return this.terminals_[symbol];
            }

            // Otherwise... this might refer to a RULE token i.e. a non-terminal: see if we can dig that one up.
            //
            // An example of this may be where a rule's action code contains a call like this:
            //
            //      parser.getSymbolName(#$)
            //
            // to obtain a human-readable name of the current grammar rule.
            var s = this.symbols_;
            for (var key in s) {
                if (s[key] === symbol) {
                    return key;
                }
            }
            return null;
        },

        // Return a more-or-less human-readable description of the given symbol, when available,
        // or the symbol itself, serving as its own 'description' for lack of something better to serve up.
        //
        // Return NULL when the symbol is unknown to the parser.
        describeSymbol: function parser_describeSymbol(symbol) {

            if (symbol !== this.EOF && this.terminal_descriptions_ && this.terminal_descriptions_[symbol]) {
                return this.terminal_descriptions_[symbol];
            }
            else if (symbol === this.EOF) {
                return 'end of input';
            }
            var id = this.getSymbolName(symbol);
            if (id) {
                return this.quoteName(id);
            }
            return null;
        },

        // Produce a (more or less) human-readable list of expected tokens at the point of failure.
        //
        // The produced list may contain token or token set descriptions instead of the tokens
        // themselves to help turning this output into something that easier to read by humans
        // unless `do_not_describe` parameter is set, in which case a list of the raw, *numeric*,
        // expected terminals and nonterminals is produced.
        //
        // The returned list (array) will not contain any duplicate entries.
        collect_expected_token_set: function parser_collect_expected_token_set(state, do_not_describe) {

            var TERROR = this.TERROR;
            var tokenset = [];
            var check = {};
            // Has this (error?) state been outfitted with a custom expectations description text for human consumption?
            // If so, use that one instead of the less palatable token set.
            if (!do_not_describe && this.state_descriptions_ && this.state_descriptions_[state]) {
                return [
                    this.state_descriptions_[state]
                ];
            }
            for (var p in this.table[state]) {
                p = +p;
                if (p !== TERROR) {
                    var d = do_not_describe ? p : this.describeSymbol(p);
                    if (d && !check[d]) {
                        tokenset.push(d);
                        check[d] = true;        // Mark this token description as already mentioned to prevent outputting duplicate entries.
                    }
                }
            }
            return tokenset;
        },
    productions_: bp$2({
      pop: u$2([
      54,
      54,
      s$2,
      [55, 6],
      56,
      57,
      57,
      s$2,
      [58, 11],
      59,
      59,
      60,
      60,
      61,
      61,
      62,
      62,
      63,
      63,
      64,
      64,
      s$2,
      [65, 4],
      66,
      66,
      67,
      67,
      s$2,
      [68, 3],
      s$2,
      [69, 9],
      s$2,
      [70, 4],
      71,
      71,
      72,
      s$2,
      [73, 4],
      s$2,
      [74, 4],
      75,
      75,
      s$2,
      [76, 17],
      77,
      78,
      78,
      79,
      79,
      80,
      s$2,
      [80, 4, 1],
      83,
      84,
      85,
      85,
      s$2,
      [86, 6],
      87,
      87,
      88,
      88,
      s$2,
      [89, 3],
      90,
      90
    ]),
      rule: u$2([
      s$2,
      [4, 3],
      s$2,
      [5, 4, -1],
      0,
      0,
      2,
      0,
      s$2,
      [2, 3],
      s$2,
      [1, 3],
      3,
      3,
      2,
      3,
      3,
      s$2,
      [1, 7],
      2,
      1,
      2,
      c$2,
      [23, 3],
      4,
      c$2,
      [32, 4],
      2,
      c$2,
      [22, 3],
      3,
      s$2,
      [2, 8],
      0,
      s$2,
      [3, 3],
      0,
      1,
      3,
      1,
      s$2,
      [3, 4, -1],
      c$2,
      [21, 3],
      c$2,
      [40, 3],
      s$2,
      [3, 4],
      s$2,
      [2, 5],
      c$2,
      [12, 3],
      s$2,
      [1, 6],
      c$2,
      [16, 3],
      c$2,
      [10, 8],
      c$2,
      [9, 3],
      s$2,
      [3, 4],
      c$2,
      [10, 4],
      c$2,
      [82, 4],
      1,
      0
    ])
    }),
    performAction: function parser__PerformAction(yyloc, yystate /* action[1] */, yysp, yyvstack, yylstack) {

              /* this == yyval */

              // the JS engine itself can go and remove these statements when `yy` turns out to be unused in any action code!
              var yy = this.yy;
              var yyparser = yy.parser;
              var yylexer = yy.lexer;

              

              switch (yystate) {
    case 0:
        /*! Production::    $accept : lex $end */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yylstack[yysp - 1];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-)
        break;

    case 1:
        /*! Production::    lex : init definitions rules_and_epilogue EOF */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        for (var key in yyvstack[yysp - 2]) {
          this.$[key] = yyvstack[yysp - 2][key];
        }
        
        // if there are any options, add them all, otherwise set options to NULL:
        // can't check for 'empty object' by `if (yy.options) ...` so we do it this way:
        for (key in yy.options) {
          this.$.options = yy.options;
          break;
        }
        
        if (yy.actionInclude) {
          var asrc = yy.actionInclude.join('\n\n');
          // Only a non-empty action code chunk should actually make it through:
          if (asrc.trim() !== '') {
            this.$.actionInclude = asrc;
          }
        }
        
        delete yy.options;
        delete yy.actionInclude;
        return this.$;

    case 2:
        /*! Production::    lex : init definitions error EOF */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 3];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        There's an error in your lexer regex rules or epilogue.
        Maybe you did not correctly separate the lexer sections with a '%%'
        on an otherwise empty line?
        The lexer spec file should have this structure:
    
                definitions
                %%
                rules
                %%                  // <-- optional!
                extra_module_code   // <-- optional epilogue!
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;

    case 3:
        /*! Production::    rules_and_epilogue : "%%" rules "%%" extra_lexer_module_code */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-)
        
        
        if (yyvstack[yysp].trim() !== '') {
          this.$ = { rules: yyvstack[yysp - 2], moduleInclude: yyvstack[yysp] };
        } else {
          this.$ = { rules: yyvstack[yysp - 2] };
        }
        break;

    case 4:
        /*! Production::    rules_and_epilogue : "%%" error rules "%%" extra_lexer_module_code */

        // default action (generated by JISON mode classic/merge :: 5,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 4];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 4, yysp);
        // END of default action (generated by JISON mode classic/merge :: 5,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        There's probably an error in one or more of your lexer regex rules.
        The lexer rule spec should have this structure:
    
                regex  action_code
    
        where 'regex' is a lex-style regex expression (see the
        jison and jison-lex documentation) which is intended to match a chunk
        of the input to lex, while the 'action_code' block is the JS code
        which will be invoked when the regex is matched. The 'action_code' block
        may be any (indented!) set of JS statements, optionally surrounded
        by '{...}' curly braces or otherwise enclosed in a '%{...%}' block.
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp - 3])}
    
          Technical error report:
        ${yyvstack[yysp - 3].errStr}
    `);
        break;

    case 5:
        /*! Production::    rules_and_epilogue : "%%" rules "%%" error */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 3];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        There's an error in your lexer epilogue a.k.a. 'extra_module_code' block.
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 6:
        /*! Production::    rules_and_epilogue : "%%" error rules */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        There's probably an error in one or more of your lexer regex rules.
        The lexer rule spec should have this structure:
    
                regex  action_code
    
        where 'regex' is a lex-style regex expression (see the
        jison and jison-lex documentation) which is intended to match a chunk
        of the input to lex, while the 'action_code' block is the JS code
        which will be invoked when the regex is matched. The 'action_code' block
        may be any (indented!) set of JS statements, optionally surrounded
        by '{...}' curly braces or otherwise enclosed in a '%{...%}' block.
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;

    case 7:
        /*! Production::    rules_and_epilogue : "%%" rules */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = { rules: yyvstack[yysp] };
        break;

    case 8:
        /*! Production::    rules_and_epilogue : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = { rules: [] };
        break;

    case 9:
        /*! Production::    init : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,-,-,LT,LA,-,-):
        this.$ = undefined;
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,-,-,LT,LA,-,-)
        
        
        yy.actionInclude = [];
        if (!yy.options) yy.options = {};
        break;

    case 10:
        /*! Production::    definitions : definitions definition */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        if (yyvstack[yysp] != null) {
          if ('length' in yyvstack[yysp]) {
            this.$.macros[yyvstack[yysp][0]] = yyvstack[yysp][1];
          } else {
            switch (yyvstack[yysp].type) {
            case 'names':
              for (var name in yyvstack[yysp].names) {
                this.$.startConditions[name] = yyvstack[yysp].names[name];
              }
              break;
        
            case 'unknown':
              this.$.unknownDecls.push(yyvstack[yysp].body);
              break;
        
            case 'imports':
              this.$.importDecls.push(yyvstack[yysp].body);
              break;
        
            case 'codeSection':
              this.$.codeSections.push(yyvstack[yysp].body);
              break;
        
            default:
              yyparser.yyError(rmCommonWS$2`
            Encountered an unsupported definition type: ${yyvstack[yysp].type}.
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
          `);
              break;
            }
          }
        }
        break;

    case 11:
        /*! Production::    definitions : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {
          macros: {},           // { hash table }
          startConditions: {},  // { hash table }
          codeSections: [],     // [ array of {qualifier,include} pairs ]
          importDecls: [],      // [ array of {name,path} pairs ]
          unknownDecls: []      // [ array of {name,value} pairs ]
        };
        break;

    case 12:
        /*! Production::    definition : NAME regex */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp - 1], yyvstack[yysp]];
        break;

    case 13:
        /*! Production::    definition : START_INC names_inclusive */
    case 14:
        /*! Production::    definition : START_EXC names_exclusive */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp];
        break;

    case 15:
        /*! Production::    definition : action */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$2(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$2`
            The '%{...%}' lexer setup action code section does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        yy.actionInclude.push(yyvstack[yysp]);
        this.$ = null;
        break;

    case 16:
        /*! Production::    definition : options */
    case 102:
        /*! Production::    option_list : option */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = null;
        break;

    case 17:
        /*! Production::    definition : UNKNOWN_DECL */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {
            type: 'unknown', 
            body: yyvstack[yysp]
        };
        break;

    case 18:
        /*! Production::    definition : IMPORT import_name import_path */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {
            type: 'imports', 
            body: { 
                name: yyvstack[yysp - 1], 
                path: yyvstack[yysp] 
            } 
        };
        break;

    case 19:
        /*! Production::    definition : IMPORT import_name error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        You did not specify a legal file path for the '%import' initialization code statement, which must have the format:
            %import qualifier_name file_path
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 20:
        /*! Production::    definition : IMPORT error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        %import name or source filename missing maybe?
    
        Note: each '%import'-ed initialization code section must be qualified by a name, e.g. 'required' before the import path itself:
            %import qualifier_name file_path
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 21:
        /*! Production::    definition : INIT_CODE init_code_name action */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$2(yyvstack[yysp], yylstack[yysp]);
        var name = yyvstack[yysp - 1];
        var code = yyvstack[yysp];
        if (rv) {
            yyparser.yyError(rmCommonWS$2`
            The '%code ${name}' action code section does not compile: ${rv}
    
            ${code}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
        `);
        }
        this.$ = {
            type: 'codeSection',
            body: {
              qualifier: yyvstack[yysp - 1],
              include: yyvstack[yysp]
            }
        };
        break;

    case 22:
        /*! Production::    definition : INIT_CODE error action */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Each '%code' initialization code section must be qualified by a name, e.g. 'required' before the action code itself:
            %code qualifier_name {action code}
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1], yylstack[yysp - 2], yylstack[yysp])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;

    case 23:
        /*! Production::    init_code_name : NAME */
    case 24:
        /*! Production::    init_code_name : STRING_LIT */
    case 25:
        /*! Production::    import_name : NAME */
    case 26:
        /*! Production::    import_name : STRING_LIT */
    case 27:
        /*! Production::    import_path : NAME */
    case 28:
        /*! Production::    import_path : STRING_LIT */
    case 64:
        /*! Production::    regex_list : regex_concat */
    case 69:
        /*! Production::    nonempty_regex_list : regex_concat */
    case 71:
        /*! Production::    regex_concat : regex_base */
    case 96:
        /*! Production::    escape_char : ESCAPE_CHAR */
    case 97:
        /*! Production::    range_regex : RANGE_REGEX */
    case 113:
        /*! Production::    module_code_chunk : CODE */
    case 116:
        /*! Production::    optional_module_code_chunk : module_code_chunk */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp];
        break;

    case 29:
        /*! Production::    names_inclusive : START_COND */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {type: 'names', names: {}}; this.$.names[yyvstack[yysp]] = 0;
        break;

    case 30:
        /*! Production::    names_inclusive : names_inclusive START_COND */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1]; this.$.names[yyvstack[yysp]] = 0;
        break;

    case 31:
        /*! Production::    names_exclusive : START_COND */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = {type: 'names', names: {}}; this.$.names[yyvstack[yysp]] = 1;
        break;

    case 32:
        /*! Production::    names_exclusive : names_exclusive START_COND */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1]; this.$.names[yyvstack[yysp]] = 1;
        break;

    case 33:
        /*! Production::    rules : rules rules_collective */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1].concat(yyvstack[yysp]);
        break;

    case 34:
        /*! Production::    rules : %epsilon */
    case 40:
        /*! Production::    rule_block : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [];
        break;

    case 35:
        /*! Production::    rules_collective : start_conditions rule */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        if (yyvstack[yysp - 1]) {
            yyvstack[yysp].unshift(yyvstack[yysp - 1]);
        }
        this.$ = [yyvstack[yysp]];
        break;

    case 36:
        /*! Production::    rules_collective : start_conditions "{" rule_block "}" */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,VU,-,LT,LA,-,-)
        
        
        if (yyvstack[yysp - 3]) {
            yyvstack[yysp - 1].forEach(function (d) {
                d.unshift(yyvstack[yysp - 3]);
            });
        }
        this.$ = yyvstack[yysp - 1];
        break;

    case 37:
        /*! Production::    rules_collective : start_conditions "{" error "}" */

        // default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 3];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 3, yysp);
        // END of default action (generated by JISON mode classic/merge :: 4,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Seems you made a mistake while specifying one of the lexer rules inside
        the start condition
           <${yyvstack[yysp - 3].join(',')}> { rules... }
        block.
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylexer.mergeLocationInfo((yysp - 3), (yysp)), yylstack[yysp - 3])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;

    case 38:
        /*! Production::    rules_collective : start_conditions "{" error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Seems you did not correctly bracket a lexer rules set inside
        the start condition
          <${yyvstack[yysp - 2].join(',')}> { rules... }
        as a terminating curly brace '}' could not be found.
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 39:
        /*! Production::    rule_block : rule_block rule */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1]; this.$.push(yyvstack[yysp]);
        break;

    case 41:
        /*! Production::    rule : regex action */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$2(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$2`
            The rule's action code section does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        this.$ = [yyvstack[yysp - 1], yyvstack[yysp]];
        break;

    case 42:
        /*! Production::    rule : regex error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp - 1], yyvstack[yysp]];
        yyparser.yyError(rmCommonWS$2`
        Lexer rule regex action code declaration error?
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 43:
        /*! Production::    action : ACTION_START action_body BRACKET_MISSING */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Missing curly braces: seems you did not correctly bracket a lexer rule action block in curly braces: '{ ... }'.
    
          Offending action body:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 44:
        /*! Production::    action : ACTION_START action_body BRACKET_SURPLUS */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Too many curly braces: seems you did not correctly bracket a lexer rule action block in curly braces: '{ ... }'.
    
          Offending action body:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    `);
        break;

    case 45:
        /*! Production::    action : ACTION_START action_body ACTION_END */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        var s = yyvstack[yysp - 1].trim();
        // remove outermost set of braces UNLESS there's
        // a curly brace in there anywhere: in that case
        // we should leave it up to the sophisticated
        // code analyzer to simplify the code!
        //
        // This is a very rough check as it will also look
        // inside code comments, which should not have
        // any influence.
        //
        // Nevertheless: this is a *safe* transform!
        if (s[0] === '{' && s.indexOf('}') === s.length - 1) {
            this.$ = s.substring(1, s.length - 1).trim();
        } else {
            this.$ = s;
        }
        break;

    case 46:
        /*! Production::    action_body : action_body ACTION */
    case 51:
        /*! Production::    action_body : action_body include_macro_code */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + '\n\n' + yyvstack[yysp] + '\n\n';
        break;

    case 47:
        /*! Production::    action_body : action_body ACTION_BODY */
    case 48:
        /*! Production::    action_body : action_body ACTION_BODY_C_COMMENT */
    case 49:
        /*! Production::    action_body : action_body ACTION_BODY_CPP_COMMENT */
    case 50:
        /*! Production::    action_body : action_body ACTION_BODY_WHITESPACE */
    case 70:
        /*! Production::    regex_concat : regex_concat regex_base */
    case 82:
        /*! Production::    regex_base : regex_base range_regex */
    case 92:
        /*! Production::    regex_set : regex_set regex_set_atom */
    case 114:
        /*! Production::    module_code_chunk : module_code_chunk CODE */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 52:
        /*! Production::    action_body : action_body INCLUDE_PLACEMENT_ERROR */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        You may place the '%include' instruction only at the start/front of a line.
    
          Its use is not permitted at this position:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    `);
        break;

    case 53:
        /*! Production::    action_body : action_body error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Seems you did not correctly match curly braces '{ ... }' in a lexer rule action block.
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 54:
        /*! Production::    action_body : %epsilon */
    case 65:
        /*! Production::    regex_list : %epsilon */
    case 117:
        /*! Production::    optional_module_code_chunk : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '';
        break;

    case 55:
        /*! Production::    start_conditions : "<" name_list ">" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1];
        break;

    case 56:
        /*! Production::    start_conditions : "<" name_list error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Seems you did not correctly terminate the start condition set <${yyvstack[yysp - 1].join(',')},???> with a terminating '>'
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 57:
        /*! Production::    start_conditions : "<" "*" ">" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = ['*'];
        break;

    case 58:
        /*! Production::    start_conditions : %epsilon */

        // default action (generated by JISON mode classic/merge :: 0,VT,VA,-,-,LT,LA,-,-):
        this.$ = undefined;
        this._$ = yyparser.yyMergeLocationInfo(null, null, null, null, true);
        // END of default action (generated by JISON mode classic/merge :: 0,VT,VA,-,-,LT,LA,-,-)
        break;

    case 59:
        /*! Production::    name_list : NAME */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = [yyvstack[yysp]];
        break;

    case 60:
        /*! Production::    name_list : name_list "," NAME */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2]; this.$.push(yyvstack[yysp]);
        break;

    case 61:
        /*! Production::    regex : nonempty_regex_list */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        // Detect if the regex ends with a pure (Unicode) word;
        // we *do* consider escaped characters which are 'alphanumeric'
        // to be equivalent to their non-escaped version, hence these are
        // all valid 'words' for the 'easy keyword rules' option:
        //
        // - hello_kitty
        // - γεια_σου_γατούλα
        // - \u03B3\u03B5\u03B9\u03B1_\u03C3\u03BF\u03C5_\u03B3\u03B1\u03C4\u03BF\u03CD\u03BB\u03B1
        //
        // http://stackoverflow.com/questions/7885096/how-do-i-decode-a-string-with-escaped-unicode#12869914
        //
        // As we only check the *tail*, we also accept these as
        // 'easy keywords':
        //
        // - %options
        // - %foo-bar
        // - +++a:b:c1
        //
        // Note the dash in that last example: there the code will consider
        // `bar` to be the keyword, which is fine with us as we're only
        // interested in the trailing boundary and patching that one for
        // the `easy_keyword_rules` option.
        this.$ = yyvstack[yysp];
        if (yy.options.easy_keyword_rules) {
          // We need to 'protect' `eval` here as keywords are allowed
          // to contain double-quotes and other leading cruft.
          // `eval` *does* gobble some escapes (such as `\b`) but
          // we protect against that through a simple replace regex:
          // we're not interested in the special escapes' exact value
          // anyway.
          // It will also catch escaped escapes (`\\`), which are not
          // word characters either, so no need to worry about
          // `eval(str)` 'correctly' converting convoluted constructs
          // like '\\\\\\\\\\b' in here.
          this.$ = this.$
          .replace(/\\\\/g, '.')
          .replace(/"/g, '.')
          .replace(/\\c[A-Z]/g, '.')
          .replace(/\\[^xu0-9]/g, '.');
        
          try {
            // Convert Unicode escapes and other escapes to their literal characters
            // BEFORE we go and check whether this item is subject to the
            // `easy_keyword_rules` option.
            this.$ = JSON.parse('"' + this.$ + '"');
          }
          catch (ex) {
            yyparser.warn('easy-keyword-rule FAIL on eval: ', ex);
        
            // make the next keyword test fail:
            this.$ = '.';
          }
          // a 'keyword' starts with an alphanumeric character,
          // followed by zero or more alphanumerics or digits:
          var re = new XRegExp__default['default']('\\w[\\w\\d]*$');
          if (XRegExp__default['default'].match(this.$, re)) {
            this.$ = yyvstack[yysp] + "\\b";
          } else {
            this.$ = yyvstack[yysp];
          }
        }
        break;

    case 62:
        /*! Production::    regex_list : regex_list "|" regex_concat */
    case 66:
        /*! Production::    nonempty_regex_list : nonempty_regex_list "|" regex_concat */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2] + '|' + yyvstack[yysp];
        break;

    case 63:
        /*! Production::    regex_list : regex_list "|" */
    case 67:
        /*! Production::    nonempty_regex_list : nonempty_regex_list "|" */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + '|';
        break;

    case 68:
        /*! Production::    nonempty_regex_list : "|" regex_concat */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '|' + yyvstack[yysp];
        break;

    case 72:
        /*! Production::    regex_base : "(" regex_list ")" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '(' + yyvstack[yysp - 1] + ')';
        break;

    case 73:
        /*! Production::    regex_base : SPECIAL_GROUP regex_list ")" */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2] + yyvstack[yysp - 1] + ')';
        break;

    case 74:
        /*! Production::    regex_base : "(" regex_list error */
    case 75:
        /*! Production::    regex_base : SPECIAL_GROUP regex_list error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Seems you did not correctly bracket a lex rule regex part in '(...)' braces.
    
          Unterminated regex part:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 76:
        /*! Production::    regex_base : regex_base "+" */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + '+';
        break;

    case 77:
        /*! Production::    regex_base : regex_base "*" */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + '*';
        break;

    case 78:
        /*! Production::    regex_base : regex_base "?" */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 1] + '?';
        break;

    case 79:
        /*! Production::    regex_base : "/" regex_base */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '(?=' + yyvstack[yysp] + ')';
        break;

    case 80:
        /*! Production::    regex_base : "/!" regex_base */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '(?!' + yyvstack[yysp] + ')';
        break;

    case 81:
        /*! Production::    regex_base : name_expansion */
    case 83:
        /*! Production::    regex_base : any_group_regex */
    case 87:
        /*! Production::    regex_base : string */
    case 88:
        /*! Production::    regex_base : escape_char */
    case 89:
        /*! Production::    name_expansion : NAME_BRACE */
    case 93:
        /*! Production::    regex_set : regex_set_atom */
    case 94:
        /*! Production::    regex_set_atom : REGEX_SET */
    case 99:
        /*! Production::    string : CHARACTER_LIT */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp];
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-)
        break;

    case 84:
        /*! Production::    regex_base : "." */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '.';
        break;

    case 85:
        /*! Production::    regex_base : "^" */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '^';
        break;

    case 86:
        /*! Production::    regex_base : "$" */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = '$';
        break;

    case 90:
        /*! Production::    any_group_regex : REGEX_SET_START regex_set REGEX_SET_END */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = yyvstack[yysp - 2] + yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 91:
        /*! Production::    any_group_regex : REGEX_SET_START regex_set error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        Seems you did not correctly bracket a lex rule regex set in '[...]' brackets.
    
          Unterminated regex set:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 95:
        /*! Production::    regex_set_atom : name_expansion */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        if (XRegExp__default['default']._getUnicodeProperty(yyvstack[yysp].replace(/[{}]/g, ''))
            && yyvstack[yysp].toUpperCase() !== yyvstack[yysp]
        ) {
            // treat this as part of an XRegExp `\p{...}` Unicode 'General Category' Property cf. http://unicode.org/reports/tr18/#Categories
            this.$ = yyvstack[yysp];
        } else {
            this.$ = yyvstack[yysp];
        }
        //yyparser.log("name expansion for: ", { name: $name_expansion, redux: $name_expansion.replace(/[{}]/g, ''), output: $$ });
        break;

    case 98:
        /*! Production::    string : STRING_LIT */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = prepareString(yyvstack[yysp]);
        break;

    case 100:
        /*! Production::    options : OPTIONS option_list OPTIONS_END */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = null;
        break;

    case 101:
        /*! Production::    option_list : option option_list */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        this.$ = null;
        break;

    case 103:
        /*! Production::    option : NAME */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp];
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-)
        
        
        yy.options[yyvstack[yysp]] = true;
        break;

    case 104:
        /*! Production::    option : NAME "=" OPTION_STRING_VALUE */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yy.options[yyvstack[yysp - 2]] = yyvstack[yysp];
        break;

    case 105:
        /*! Production::    option : NAME "=" OPTION_VALUE */
    case 106:
        /*! Production::    option : NAME "=" NAME */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        yy.options[yyvstack[yysp - 2]] = parseValue$1(yyvstack[yysp]);
        break;

    case 107:
        /*! Production::    option : NAME "=" error */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 2];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$2`
        Internal error: option "${$option}" value assignment failure.
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 2])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 108:
        /*! Production::    option : error */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp];
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$2`
        Expected a valid option name (with optional value assignment).
    
          Erroneous area:
        ${yylexer.prettyPrintRange(yylstack[yysp])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 109:
        /*! Production::    extra_lexer_module_code : optional_module_code_chunk */

        // default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yylstack[yysp];
        // END of default action (generated by JISON mode classic/merge :: 1,VT,VA,VU,-,LT,LA,-,-)
        
        
        var rv = checkActionBlock$2(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$2`
            The extra lexer module code section (a.k.a. 'epilogue') does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        this.$ = yyvstack[yysp];
        break;

    case 110:
        /*! Production::    extra_lexer_module_code : extra_lexer_module_code include_macro_code optional_module_code_chunk */

        // default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 2, yysp);
        // END of default action (generated by JISON mode classic/merge :: 3,VT,VA,VU,-,LT,LA,-,-)
        
        
        // Each of the 3 chunks should be parse-able as a JS snippet on its own.
        //
        // Note: we have already checked the first section in a previous reduction
        // of this rule, so we don't need to check that one again!
        var rv = checkActionBlock$2(yyvstack[yysp - 1], yylstack[yysp - 1]);
        if (rv) {
            yyparser.yyError(rmCommonWS$2`
            The source code %include-d into the extra lexer module code section (a.k.a. 'epilogue') does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp - 1])}
        `);
        }
        rv = checkActionBlock$2(yyvstack[yysp], yylstack[yysp]);
        if (rv) {
            yyparser.yyError(rmCommonWS$2`
            The extra lexer module code section (a.k.a. 'epilogue') does not compile: ${rv}
    
              Erroneous area:
            ${yylexer.prettyPrintRange(yylstack[yysp])}
        `);
        }
        this.$ = yyvstack[yysp - 2] + yyvstack[yysp - 1] + yyvstack[yysp];
        break;

    case 111:
        /*! Production::    include_macro_code : INCLUDE PATH */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-):
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,VU,-,LT,LA,-,-)
        
        
        var fileContent = fs__default['default'].readFileSync(yyvstack[yysp], { encoding: 'utf-8' });
        // And no, we don't support nested '%include':
        this.$ = '\n// Included by Jison: ' + yyvstack[yysp] + ':\n\n' + fileContent + '\n\n// End Of Include by Jison: ' + yyvstack[yysp] + '\n\n';
        break;

    case 112:
        /*! Production::    include_macro_code : INCLUDE error */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        yyparser.yyError(rmCommonWS$2`
        %include MUST be followed by a valid file path.
    
          Erroneous path:
        ${yylexer.prettyPrintRange(yylstack[yysp], yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp].errStr}
    `);
        break;

    case 115:
        /*! Production::    module_code_chunk : error CODE */

        // default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-):
        this.$ = yyvstack[yysp - 1];
        this._$ = yyparser.yyMergeLocationInfo(yysp - 1, yysp);
        // END of default action (generated by JISON mode classic/merge :: 2,VT,VA,-,-,LT,LA,-,-)
        
        
        // TODO ...
        yyparser.yyError(rmCommonWS$2`
        Module code declaration error?
    
          Erroneous code:
        ${yylexer.prettyPrintRange(yylstack[yysp - 1])}
    
          Technical error report:
        ${yyvstack[yysp - 1].errStr}
    `);
        break;
                
    }
    },
    table: bt$2({
      len: u$2([
      13,
      1,
      12,
      15,
      1,
      1,
      11,
      19,
      21,
      2,
      2,
      s$2,
      [11, 3],
      4,
      4,
      12,
      4,
      1,
      1,
      19,
      18,
      11,
      12,
      18,
      29,
      30,
      22,
      22,
      17,
      17,
      s$2,
      [29, 7],
      31,
      5,
      s$2,
      [29, 3],
      s$2,
      [12, 4],
      4,
      11,
      3,
      3,
      2,
      2,
      1,
      1,
      12,
      1,
      5,
      4,
      3,
      7,
      17,
      23,
      3,
      19,
      30,
      29,
      30,
      s$2,
      [29, 5],
      3,
      20,
      3,
      30,
      30,
      6,
      s$2,
      [4, 3],
      12,
      12,
      s$2,
      [11, 6],
      s$2,
      [27, 3],
      s$2,
      [11, 8],
      2,
      11,
      1,
      4,
      c$2,
      [55, 3],
      3,
      3,
      17,
      16,
      3,
      3,
      1,
      3,
      7,
      s$2,
      [29, 3],
      21,
      s$2,
      [29, 4],
      4,
      13,
      13,
      s$2,
      [3, 4],
      6,
      3,
      3,
      23,
      s$2,
      [18, 3],
      14,
      14,
      1,
      14,
      3,
      1,
      20,
      2,
      17,
      14,
      17,
      3
    ]),
      symbol: u$2([
      1,
      2,
      s$2,
      [19, 7, 1],
      28,
      47,
      54,
      56,
      1,
      c$2,
      [14, 11],
      57,
      c$2,
      [12, 11],
      55,
      58,
      68,
      84,
      s$2,
      [1, 3],
      c$2,
      [17, 10],
      1,
      2,
      3,
      5,
      9,
      10,
      s$2,
      [14, 4, 1],
      19,
      26,
      s$2,
      [38, 4, 1],
      44,
      46,
      64,
      c$2,
      [15, 6],
      c$2,
      [14, 7],
      72,
      s$2,
      [74, 5, 1],
      81,
      83,
      27,
      62,
      27,
      63,
      c$2,
      [55, 13],
      c$2,
      [11, 20],
      2,
      20,
      26,
      60,
      c$2,
      [4, 3],
      59,
      2,
      s$2,
      [29, 9, 1],
      51,
      69,
      2,
      20,
      85,
      86,
      s$2,
      [1, 3],
      c$2,
      [102, 16],
      65,
      70,
      c$2,
      [19, 17],
      64,
      c$2,
      [85, 13],
      9,
      c$2,
      [12, 9],
      c$2,
      [143, 12],
      c$2,
      [141, 6],
      c$2,
      [30, 3],
      c$2,
      [58, 6],
      s$2,
      [20, 7, 1],
      28,
      c$2,
      [29, 6],
      47,
      c$2,
      [29, 7],
      7,
      s$2,
      [9, 9, 1],
      c$2,
      [33, 14],
      45,
      46,
      47,
      82,
      c$2,
      [58, 3],
      11,
      c$2,
      [80, 11],
      73,
      c$2,
      [81, 6],
      c$2,
      [22, 22],
      c$2,
      [121, 12],
      c$2,
      [17, 22],
      c$2,
      [108, 29],
      c$2,
      [29, 199],
      s$2,
      [42, 6, 1],
      40,
      43,
      77,
      79,
      80,
      c$2,
      [123, 89],
      c$2,
      [19, 7],
      27,
      c$2,
      [590, 11],
      c$2,
      [12, 27],
      c$2,
      [611, 3],
      61,
      c$2,
      [630, 14],
      c$2,
      [3, 3],
      28,
      68,
      28,
      68,
      28,
      28,
      c$2,
      [634, 11],
      88,
      48,
      2,
      20,
      48,
      85,
      86,
      2,
      18,
      20,
      c$2,
      [9, 4],
      1,
      2,
      51,
      53,
      87,
      89,
      90,
      c$2,
      [629, 17],
      3,
      c$2,
      [750, 13],
      67,
      c$2,
      [751, 8],
      7,
      20,
      71,
      c$2,
      [691, 20],
      c$2,
      [632, 23],
      c$2,
      [662, 65],
      c$2,
      [526, 145],
      2,
      9,
      11,
      c$2,
      [788, 15],
      c$2,
      [808, 7],
      11,
      c$2,
      [201, 59],
      82,
      2,
      40,
      42,
      43,
      77,
      80,
      c$2,
      [6, 4],
      c$2,
      [4, 8],
      c$2,
      [495, 33],
      c$2,
      [11, 59],
      3,
      4,
      c$2,
      [449, 8],
      c$2,
      [401, 15],
      c$2,
      [27, 54],
      c$2,
      [603, 11],
      c$2,
      [11, 78],
      52,
      c$2,
      [182, 11],
      c$2,
      [683, 3],
      49,
      50,
      1,
      51,
      88,
      1,
      53,
      1,
      51,
      1,
      51,
      c$2,
      [5, 3],
      53,
      c$2,
      [647, 17],
      2,
      4,
      c$2,
      [691, 13],
      66,
      2,
      28,
      68,
      2,
      6,
      8,
      6,
      c$2,
      [4, 3],
      c$2,
      [740, 8],
      c$2,
      [648, 57],
      c$2,
      [531, 31],
      c$2,
      [528, 13],
      c$2,
      [756, 8],
      c$2,
      [668, 115],
      c$2,
      [568, 5],
      c$2,
      [321, 10],
      53,
      c$2,
      [13, 13],
      c$2,
      [1004, 3],
      c$2,
      [3, 9],
      c$2,
      [273, 4],
      c$2,
      [272, 3],
      c$2,
      [328, 5],
      c$2,
      [310, 14],
      c$2,
      [1001, 9],
      1,
      c$2,
      [496, 10],
      c$2,
      [27, 7],
      c$2,
      [18, 36],
      c$2,
      [1078, 14],
      c$2,
      [14, 14],
      20,
      c$2,
      [15, 14],
      c$2,
      [461, 3],
      53,
      c$2,
      [843, 20],
      c$2,
      [480, 3],
      c$2,
      [474, 16],
      c$2,
      [163, 14],
      c$2,
      [505, 18],
      6,
      8
    ]),
      type: u$2([
      s$2,
      [2, 11],
      0,
      0,
      1,
      c$2,
      [14, 12],
      c$2,
      [26, 13],
      0,
      c$2,
      [15, 12],
      s$2,
      [2, 20],
      c$2,
      [32, 14],
      s$2,
      [0, 8],
      c$2,
      [23, 3],
      c$2,
      [57, 32],
      c$2,
      [62, 9],
      c$2,
      [113, 13],
      c$2,
      [67, 4],
      c$2,
      [40, 20],
      c$2,
      [21, 18],
      c$2,
      [96, 36],
      c$2,
      [141, 7],
      c$2,
      [30, 28],
      c$2,
      [221, 43],
      c$2,
      [223, 9],
      c$2,
      [22, 34],
      c$2,
      [17, 34],
      s$2,
      [2, 224],
      c$2,
      [239, 141],
      c$2,
      [139, 19],
      c$2,
      [673, 16],
      c$2,
      [14, 5],
      c$2,
      [180, 13],
      c$2,
      [764, 35],
      c$2,
      [751, 9],
      c$2,
      [98, 19],
      c$2,
      [632, 31],
      c$2,
      [662, 75],
      c$2,
      [511, 151],
      c$2,
      [513, 34],
      c$2,
      [231, 35],
      c$2,
      [821, 238],
      c$2,
      [735, 74],
      c$2,
      [43, 27],
      c$2,
      [740, 39],
      c$2,
      [1202, 78],
      c$2,
      [756, 30],
      c$2,
      [696, 140],
      c$2,
      [1001, 31],
      c$2,
      [461, 114],
      c$2,
      [121, 58]
    ]),
      state: u$2([
      s$2,
      [1, 4, 1],
      6,
      11,
      12,
      20,
      22,
      23,
      25,
      26,
      31,
      32,
      37,
      36,
      43,
      45,
      47,
      51,
      55,
      56,
      57,
      61,
      62,
      64,
      66,
      c$2,
      [16, 5],
      67,
      c$2,
      [5, 4],
      71,
      73,
      74,
      c$2,
      [13, 5],
      75,
      c$2,
      [7, 6],
      76,
      c$2,
      [5, 4],
      77,
      c$2,
      [5, 4],
      81,
      78,
      79,
      84,
      88,
      89,
      98,
      103,
      57,
      105,
      108,
      107,
      110,
      112,
      c$2,
      [67, 7],
      113,
      61,
      62,
      117,
      c$2,
      [60, 11],
      c$2,
      [6, 6],
      71,
      81,
      125,
      132,
      135,
      137,
      143,
      108,
      107,
      c$2,
      [15, 5],
      145,
      c$2,
      [32, 5],
      108,
      146,
      148,
      c$2,
      [52, 8],
      132,
      c$2,
      [23, 5]
    ]),
      mode: u$2([
      s$2,
      [2, 23],
      s$2,
      [1, 12],
      c$2,
      [24, 13],
      c$2,
      [41, 28],
      c$2,
      [44, 15],
      c$2,
      [89, 27],
      c$2,
      [17, 13],
      c$2,
      [88, 11],
      c$2,
      [64, 34],
      c$2,
      [38, 14],
      c$2,
      [123, 15],
      c$2,
      [92, 12],
      1,
      c$2,
      [107, 10],
      c$2,
      [27, 6],
      c$2,
      [72, 23],
      c$2,
      [40, 8],
      c$2,
      [45, 7],
      c$2,
      [15, 13],
      s$2,
      [1, 24],
      s$2,
      [2, 234],
      c$2,
      [236, 98],
      c$2,
      [97, 24],
      c$2,
      [24, 15],
      c$2,
      [374, 20],
      c$2,
      [432, 5],
      c$2,
      [409, 15],
      c$2,
      [585, 9],
      c$2,
      [47, 20],
      c$2,
      [45, 25],
      c$2,
      [36, 14],
      c$2,
      [578, 18],
      c$2,
      [602, 53],
      c$2,
      [459, 145],
      c$2,
      [735, 19],
      c$2,
      [797, 33],
      c$2,
      [29, 25],
      c$2,
      [776, 238],
      c$2,
      [813, 51],
      c$2,
      [289, 5],
      c$2,
      [648, 7],
      c$2,
      [298, 21],
      c$2,
      [738, 18],
      c$2,
      [621, 8],
      c$2,
      [376, 7],
      c$2,
      [651, 22],
      c$2,
      [874, 59],
      c$2,
      [1219, 170],
      c$2,
      [960, 9],
      c$2,
      [947, 23],
      c$2,
      [1151, 89],
      c$2,
      [805, 17],
      s$2,
      [2, 53]
    ]),
      goto: u$2([
      s$2,
      [9, 11],
      s$2,
      [11, 11],
      8,
      5,
      s$2,
      [7, 4, 1],
      s$2,
      [13, 7, 1],
      s$2,
      [10, 11],
      34,
      21,
      s$2,
      [34, 16],
      24,
      27,
      29,
      33,
      34,
      35,
      40,
      28,
      30,
      38,
      39,
      42,
      41,
      44,
      46,
      s$2,
      [15, 11],
      s$2,
      [16, 11],
      s$2,
      [17, 11],
      48,
      49,
      50,
      52,
      53,
      s$2,
      [54, 12],
      59,
      58,
      1,
      2,
      7,
      58,
      63,
      s$2,
      [58, 6],
      60,
      s$2,
      [58, 7],
      s$2,
      [34, 17],
      s$2,
      [12, 11],
      61,
      61,
      65,
      s$2,
      [61, 9],
      c$2,
      [125, 12],
      s$2,
      [69, 3],
      c$2,
      [15, 5],
      s$2,
      [69, 7],
      40,
      69,
      c$2,
      [23, 7],
      71,
      71,
      c$2,
      [3, 3],
      71,
      68,
      70,
      s$2,
      [71, 18],
      72,
      71,
      71,
      65,
      65,
      27,
      65,
      c$2,
      [68, 11],
      c$2,
      [15, 15],
      c$2,
      [95, 12],
      c$2,
      [12, 12],
      s$2,
      [81, 29],
      s$2,
      [83, 29],
      s$2,
      [84, 29],
      s$2,
      [85, 29],
      s$2,
      [86, 29],
      s$2,
      [87, 29],
      s$2,
      [88, 29],
      s$2,
      [89, 31],
      38,
      80,
      s$2,
      [98, 29],
      s$2,
      [99, 29],
      s$2,
      [96, 29],
      s$2,
      [13, 9],
      82,
      13,
      13,
      s$2,
      [29, 12],
      s$2,
      [14, 9],
      83,
      14,
      14,
      s$2,
      [31, 12],
      85,
      86,
      87,
      s$2,
      [20, 11],
      s$2,
      [25, 3],
      s$2,
      [26, 3],
      16,
      16,
      23,
      24,
      100,
      s$2,
      [90, 8, 1],
      99,
      101,
      102,
      59,
      58,
      102,
      103,
      104,
      103,
      103,
      s$2,
      [108, 3],
      117,
      106,
      117,
      109,
      s$2,
      [33, 17],
      111,
      c$2,
      [684, 13],
      114,
      115,
      6,
      c$2,
      [630, 8],
      116,
      s$2,
      [58, 7],
      s$2,
      [67, 3],
      c$2,
      [34, 5],
      s$2,
      [67, 7],
      40,
      67,
      c$2,
      [42, 6],
      67,
      s$2,
      [68, 3],
      c$2,
      [24, 5],
      s$2,
      [68, 7],
      40,
      68,
      c$2,
      [24, 6],
      68,
      70,
      70,
      69,
      s$2,
      [70, 3],
      c$2,
      [7, 3],
      s$2,
      [70, 17],
      72,
      70,
      70,
      s$2,
      [76, 29],
      s$2,
      [77, 29],
      s$2,
      [78, 29],
      s$2,
      [82, 29],
      s$2,
      [97, 29],
      119,
      120,
      118,
      64,
      64,
      27,
      64,
      c$2,
      [259, 11],
      122,
      120,
      121,
      79,
      79,
      69,
      s$2,
      [79, 3],
      68,
      70,
      s$2,
      [79, 18],
      72,
      79,
      79,
      80,
      80,
      69,
      s$2,
      [80, 3],
      68,
      70,
      s$2,
      [80, 18],
      72,
      80,
      80,
      124,
      38,
      123,
      80,
      s$2,
      [93, 4],
      s$2,
      [94, 4],
      s$2,
      [95, 4],
      s$2,
      [30, 12],
      s$2,
      [32, 12],
      s$2,
      [18, 11],
      s$2,
      [19, 11],
      s$2,
      [27, 11],
      s$2,
      [28, 11],
      s$2,
      [21, 11],
      s$2,
      [22, 11],
      s$2,
      [43, 27],
      s$2,
      [44, 27],
      s$2,
      [45, 27],
      s$2,
      [46, 11],
      s$2,
      [47, 11],
      s$2,
      [48, 11],
      s$2,
      [49, 11],
      s$2,
      [50, 11],
      s$2,
      [51, 11],
      s$2,
      [52, 11],
      s$2,
      [53, 11],
      127,
      126,
      s$2,
      [100, 11],
      101,
      131,
      130,
      128,
      129,
      3,
      101,
      5,
      133,
      109,
      109,
      116,
      116,
      134,
      s$2,
      [113, 3],
      s$2,
      [35, 17],
      136,
      s$2,
      [40, 14],
      138,
      16,
      140,
      139,
      141,
      142,
      s$2,
      [59, 3],
      117,
      144,
      117,
      109,
      s$2,
      [66, 3],
      c$2,
      [627, 5],
      s$2,
      [66, 7],
      40,
      66,
      c$2,
      [434, 6],
      66,
      s$2,
      [72, 29],
      s$2,
      [74, 29],
      63,
      63,
      27,
      63,
      c$2,
      [508, 11],
      s$2,
      [73, 29],
      s$2,
      [75, 29],
      s$2,
      [90, 29],
      s$2,
      [91, 29],
      s$2,
      [92, 4],
      s$2,
      [111, 13],
      s$2,
      [112, 13],
      s$2,
      [104, 3],
      s$2,
      [105, 3],
      s$2,
      [106, 3],
      s$2,
      [107, 3],
      c$2,
      [259, 4],
      s$2,
      [115, 3],
      s$2,
      [114, 3],
      147,
      c$2,
      [949, 13],
      38,
      38,
      149,
      s$2,
      [38, 15],
      s$2,
      [41, 18],
      s$2,
      [42, 18],
      s$2,
      [55, 14],
      s$2,
      [56, 14],
      150,
      s$2,
      [57, 14],
      4,
      101,
      133,
      62,
      62,
      27,
      62,
      c$2,
      [115, 11],
      110,
      110,
      s$2,
      [36, 17],
      s$2,
      [39, 14],
      s$2,
      [37, 17],
      s$2,
      [60, 3]
    ])
    }),
    defaultActions: bda$1({
      idx: u$2([
      0,
      2,
      6,
      11,
      12,
      13,
      16,
      18,
      19,
      21,
      22,
      s$2,
      [31, 8, 1],
      40,
      41,
      s$2,
      [42, 4, 2],
      49,
      50,
      53,
      54,
      59,
      61,
      s$2,
      [68, 5, 1],
      s$2,
      [79, 22, 1],
      102,
      103,
      107,
      109,
      110,
      115,
      118,
      119,
      s$2,
      [121, 11, 1],
      133,
      134,
      s$2,
      [137, 4, 1],
      142,
      s$2,
      [146, 5, 1]
    ]),
      goto: u$2([
      9,
      11,
      10,
      15,
      16,
      17,
      54,
      1,
      2,
      34,
      12,
      81,
      s$2,
      [83, 7, 1],
      98,
      99,
      96,
      29,
      31,
      20,
      25,
      26,
      23,
      24,
      108,
      33,
      76,
      77,
      78,
      82,
      97,
      93,
      94,
      95,
      30,
      32,
      18,
      19,
      27,
      28,
      21,
      22,
      s$2,
      [43, 11, 1],
      100,
      101,
      109,
      113,
      35,
      59,
      72,
      74,
      73,
      75,
      90,
      91,
      92,
      111,
      112,
      s$2,
      [104, 4, 1],
      115,
      114,
      41,
      42,
      55,
      56,
      57,
      110,
      36,
      39,
      37,
      60
    ])
    }),
    parseError: function parseError(str, hash, ExceptionClass) {

        if (hash.recoverable) {
            if (typeof this.trace === 'function') {
                this.trace(str);
            }
            hash.destroy();             // destroy... well, *almost*!
        } else {
            if (typeof this.trace === 'function') {
                this.trace(str);
            }
            if (!ExceptionClass) {
                ExceptionClass = this.JisonParserError;
            }
            throw new ExceptionClass(str, hash);
        }
    },
    parse: function parse(input) {
        var self = this;
        var stack = new Array(128);         // token stack: stores token which leads to state at the same index (column storage)
        var sstack = new Array(128);        // state stack: stores states (column storage)

        var vstack = new Array(128);        // semantic value stack
        var lstack = new Array(128);        // location stack
        var table = this.table;
        var sp = 0;                         // 'stack pointer': index into the stacks
        var yyloc;

        


        var symbol = 0;
        var preErrorSymbol = 0;
        var lastEofErrorStateDepth = Infinity;
        var recoveringErrorInfo = null;
        var recovering = 0;                 // (only used when the grammar contains error recovery rules)
        var TERROR = this.TERROR;
        var EOF = this.EOF;
        var ERROR_RECOVERY_TOKEN_DISCARD_COUNT = (this.options.errorRecoveryTokenDiscardCount | 0) || 3;
        var NO_ACTION = [0, 151 /* === table.length :: ensures that anyone using this new state will fail dramatically! */];

        var lexer;
        if (this.__lexer__) {
            lexer = this.__lexer__;
        } else {
            lexer = this.__lexer__ = Object.create(this.lexer);
        }

        var sharedState_yy = {
            parseError: undefined,
            quoteName: undefined,
            lexer: undefined,
            parser: undefined,
            pre_parse: undefined,
            post_parse: undefined,
            pre_lex: undefined,
            post_lex: undefined      // WARNING: must be written this way for the code expanders to work correctly in both ES5 and ES6 modes!
        };

        var ASSERT;
        if (typeof assert !== 'function') {
            ASSERT = function JisonAssert(cond, msg) {
                if (!cond) {
                    throw new Error('assertion failed: ' + (msg || '***'));
                }
            };
        } else {
            ASSERT = assert;
        }

        this.yyGetSharedState = function yyGetSharedState() {
            return sharedState_yy;
        };


        this.yyGetErrorInfoTrack = function yyGetErrorInfoTrack() {
            return recoveringErrorInfo;
        };


        // shallow clone objects, straight copy of simple `src` values
        // e.g. `lexer.yytext` MAY be a complex value object,
        // rather than a simple string/value.
        function shallow_copy(src) {
            if (typeof src === 'object') {
                var dst = {};
                for (var k in src) {
                    if (Object.prototype.hasOwnProperty.call(src, k)) {
                        dst[k] = src[k];
                    }
                }
                return dst;
            }
            return src;
        }
        function shallow_copy_noclobber(dst, src) {
            for (var k in src) {
                if (typeof dst[k] === 'undefined' && Object.prototype.hasOwnProperty.call(src, k)) {
                    dst[k] = src[k];
                }
            }
        }
        function copy_yylloc(loc) {
            var rv = shallow_copy(loc);
            if (rv && rv.range) {
                rv.range = rv.range.slice(0);
            }
            return rv;
        }

        // copy state
        shallow_copy_noclobber(sharedState_yy, this.yy);

        sharedState_yy.lexer = lexer;
        sharedState_yy.parser = this;





        // *Always* setup `yyError`, `YYRECOVERING`, `yyErrOk` and `yyClearIn` functions as it is paramount
        // to have *their* closure match ours -- if we only set them up once,
        // any subsequent `parse()` runs will fail in very obscure ways when
        // these functions are invoked in the user action code block(s) as
        // their closure will still refer to the `parse()` instance which set
        // them up. Hence we MUST set them up at the start of every `parse()` run!
        if (this.yyError) {
            this.yyError = function yyError(str /*, ...args */) {











                var error_rule_depth = (this.options.parserErrorsAreRecoverable ? locateNearestErrorRecoveryRule(state) : -1);
                var expected = this.collect_expected_token_set(state);
                var hash = this.constructParseErrorInfo(str, null, expected, (error_rule_depth >= 0));
                // append to the old one?
                if (recoveringErrorInfo) {
                    var esp = recoveringErrorInfo.info_stack_pointer;

                    recoveringErrorInfo.symbol_stack[esp] = symbol;
                    var v = this.shallowCopyErrorInfo(hash);
                    v.yyError = true;
                    v.errorRuleDepth = error_rule_depth;
                    v.recovering = recovering;
                    // v.stackSampleLength = error_rule_depth + EXTRA_STACK_SAMPLE_DEPTH;

                    recoveringErrorInfo.value_stack[esp] = v;
                    recoveringErrorInfo.location_stack[esp] = copy_yylloc(lexer.yylloc);
                    recoveringErrorInfo.state_stack[esp] = newState || NO_ACTION[1];

                    ++esp;
                    recoveringErrorInfo.info_stack_pointer = esp;
                } else {
                    recoveringErrorInfo = this.shallowCopyErrorInfo(hash);
                    recoveringErrorInfo.yyError = true;
                    recoveringErrorInfo.errorRuleDepth = error_rule_depth;
                    recoveringErrorInfo.recovering = recovering;
                }


                // Add any extra args to the hash under the name `extra_error_attributes`:
                var args = Array.prototype.slice.call(arguments, 1);
                if (args.length) {
                    hash.extra_error_attributes = args;
                }

                return this.parseError(str, hash, this.JisonParserError);
            };
        }







        // Does the shared state override the default `parseError` that already comes with this instance?
        if (typeof sharedState_yy.parseError === 'function') {
            this.parseError = function parseErrorAlt(str, hash, ExceptionClass) {
                if (!ExceptionClass) {
                    ExceptionClass = this.JisonParserError;
                }
                return sharedState_yy.parseError.call(this, str, hash, ExceptionClass);
            };
        } else {
            this.parseError = this.originalParseError;
        }

        // Does the shared state override the default `quoteName` that already comes with this instance?
        if (typeof sharedState_yy.quoteName === 'function') {
            this.quoteName = function quoteNameAlt(id_str) {
                return sharedState_yy.quoteName.call(this, id_str);
            };
        } else {
            this.quoteName = this.originalQuoteName;
        }

        // set up the cleanup function; make it an API so that external code can re-use this one in case of
        // calamities or when the `%options no-try-catch` option has been specified for the grammar, in which
        // case this parse() API method doesn't come with a `finally { ... }` block any more!
        //
        // NOTE: as this API uses parse() as a closure, it MUST be set again on every parse() invocation,
        //       or else your `sharedState`, etc. references will be *wrong*!
        this.cleanupAfterParse = function parser_cleanupAfterParse(resultValue, invoke_post_methods, do_not_nuke_errorinfos) {
            var rv;

            if (invoke_post_methods) {
                var hash;

                if (sharedState_yy.post_parse || this.post_parse) {
                    // create an error hash info instance: we re-use this API in a **non-error situation**
                    // as this one delivers all parser internals ready for access by userland code.
                    hash = this.constructParseErrorInfo(null /* no error! */, null /* no exception! */, null, false);
                }

                if (sharedState_yy.post_parse) {
                    rv = sharedState_yy.post_parse.call(this, sharedState_yy, resultValue, hash);
                    if (typeof rv !== 'undefined') resultValue = rv;
                }
                if (this.post_parse) {
                    rv = this.post_parse.call(this, sharedState_yy, resultValue, hash);
                    if (typeof rv !== 'undefined') resultValue = rv;
                }

                // cleanup:
                if (hash && hash.destroy) {
                    hash.destroy();
                }
            }

            if (this.__reentrant_call_depth > 1) return resultValue;        // do not (yet) kill the sharedState when this is a reentrant run.

            // clean up the lingering lexer structures as well:
            if (lexer.cleanupAfterLex) {
                lexer.cleanupAfterLex(do_not_nuke_errorinfos);
            }

            // prevent lingering circular references from causing memory leaks:
            if (sharedState_yy) {
                sharedState_yy.lexer = undefined;
                sharedState_yy.parser = undefined;
                if (lexer.yy === sharedState_yy) {
                    lexer.yy = undefined;
                }
            }
            sharedState_yy = undefined;
            this.parseError = this.originalParseError;
            this.quoteName = this.originalQuoteName;

            // nuke the vstack[] array at least as that one will still reference obsoleted user values.
            // To be safe, we nuke the other internal stack columns as well...
            stack.length = 0;               // fastest way to nuke an array without overly bothering the GC
            sstack.length = 0;
            lstack.length = 0;
            vstack.length = 0;
            sp = 0;

            // nuke the error hash info instances created during this run.
            // Userland code must COPY any data/references
            // in the error hash instance(s) it is more permanently interested in.
            if (!do_not_nuke_errorinfos) {
                for (var i = this.__error_infos.length - 1; i >= 0; i--) {
                    var el = this.__error_infos[i];
                    if (el && typeof el.destroy === 'function') {
                        el.destroy();
                    }
                }
                this.__error_infos.length = 0;


                for (var i = this.__error_recovery_infos.length - 1; i >= 0; i--) {
                    var el = this.__error_recovery_infos[i];
                    if (el && typeof el.destroy === 'function') {
                        el.destroy();
                    }
                }
                this.__error_recovery_infos.length = 0;

                // `recoveringErrorInfo` is also part of the `__error_recovery_infos` array,
                // hence has been destroyed already: no need to do that *twice*.
                if (recoveringErrorInfo) {
                    recoveringErrorInfo = undefined;
                }


            }

            return resultValue;
        };

        // merge yylloc info into a new yylloc instance.
        //
        // `first_index` and `last_index` MAY be UNDEFINED/NULL or these are indexes into the `lstack[]` location stack array.
        //
        // `first_yylloc` and `last_yylloc` MAY be UNDEFINED/NULL or explicit (custom or regular) `yylloc` instances, in which
        // case these override the corresponding first/last indexes.
        //
        // `dont_look_back` is an optional flag (default: FALSE), which instructs this merge operation NOT to search
        // through the parse location stack for a location, which would otherwise be used to construct the new (epsilon!)
        // yylloc info.
        //
        // Note: epsilon rule's yylloc situation is detected by passing both `first_index` and `first_yylloc` as UNDEFINED/NULL.
        this.yyMergeLocationInfo = function parser_yyMergeLocationInfo(first_index, last_index, first_yylloc, last_yylloc, dont_look_back) {
            var i1 = first_index | 0,
                i2 = last_index | 0;
            var l1 = first_yylloc,
                l2 = last_yylloc;
            var rv;

            // rules:
            // - first/last yylloc entries override first/last indexes

            if (!l1) {
                if (first_index != null) {
                    for (var i = i1; i <= i2; i++) {
                        l1 = lstack[i];
                        if (l1) {
                            break;
                        }
                    }
                }
            }

            if (!l2) {
                if (last_index != null) {
                    for (var i = i2; i >= i1; i--) {
                        l2 = lstack[i];
                        if (l2) {
                            break;
                        }
                    }
                }
            }

            // - detect if an epsilon rule is being processed and act accordingly:
            if (!l1 && first_index == null) {
                // epsilon rule span merger. With optional look-ahead in l2.
                if (!dont_look_back) {
                    for (var i = (i1 || sp) - 1; i >= 0; i--) {
                        l1 = lstack[i];
                        if (l1) {
                            break;
                        }
                    }
                }
                if (!l1) {
                    if (!l2) {
                        // when we still don't have any valid yylloc info, we're looking at an epsilon rule
                        // without look-ahead and no preceding terms and/or `dont_look_back` set:
                        // in that case we ca do nothing but return NULL/UNDEFINED:
                        return undefined;
                    } else {
                        // shallow-copy L2: after all, we MAY be looking
                        // at unconventional yylloc info objects...
                        rv = shallow_copy(l2);
                        if (rv.range) {
                            // shallow copy the yylloc ranges info to prevent us from modifying the original arguments' entries:
                            rv.range = rv.range.slice(0);
                        }
                        return rv;
                    }
                } else {
                    // shallow-copy L1, then adjust first col/row 1 column past the end.
                    rv = shallow_copy(l1);
                    rv.first_line = rv.last_line;
                    rv.first_column = rv.last_column;
                    if (rv.range) {
                        // shallow copy the yylloc ranges info to prevent us from modifying the original arguments' entries:
                        rv.range = rv.range.slice(0);
                        rv.range[0] = rv.range[1];
                    }

                    if (l2) {
                        // shallow-mixin L2, then adjust last col/row accordingly.
                        shallow_copy_noclobber(rv, l2);
                        rv.last_line = l2.last_line;
                        rv.last_column = l2.last_column;
                        if (rv.range && l2.range) {
                            rv.range[1] = l2.range[1];
                        }
                    }
                    return rv;
                }
            }

            if (!l1) {
                l1 = l2;
                l2 = null;
            }
            if (!l1) {
                return undefined;
            }

            // shallow-copy L1|L2, before we try to adjust the yylloc values: after all, we MAY be looking
            // at unconventional yylloc info objects...
            rv = shallow_copy(l1);

            // first_line: ...,
            // first_column: ...,
            // last_line: ...,
            // last_column: ...,
            if (rv.range) {
                // shallow copy the yylloc ranges info to prevent us from modifying the original arguments' entries:
                rv.range = rv.range.slice(0);
            }

            if (l2) {
                shallow_copy_noclobber(rv, l2);
                rv.last_line = l2.last_line;
                rv.last_column = l2.last_column;
                if (rv.range && l2.range) {
                    rv.range[1] = l2.range[1];
                }
            }

            return rv;
        };

        // NOTE: as this API uses parse() as a closure, it MUST be set again on every parse() invocation,
        //       or else your `lexer`, `sharedState`, etc. references will be *wrong*!
        this.constructParseErrorInfo = function parser_constructParseErrorInfo(msg, ex, expected, recoverable) {
            var pei = {
                errStr: msg,
                exception: ex,
                text: lexer.match,
                value: lexer.yytext,
                token: this.describeSymbol(symbol) || symbol,
                token_id: symbol,
                line: lexer.yylineno,
                loc: copy_yylloc(lexer.yylloc),
                expected: expected,
                recoverable: recoverable,
                state: state,
                action: action,
                new_state: newState,
                symbol_stack: stack,
                state_stack: sstack,
                value_stack: vstack,
                location_stack: lstack,
                stack_pointer: sp,
                yy: sharedState_yy,
                lexer: lexer,
                parser: this,

                // and make sure the error info doesn't stay due to potential
                // ref cycle via userland code manipulations.
                // These would otherwise all be memory leak opportunities!
                //
                // Note that only array and object references are nuked as those
                // constitute the set of elements which can produce a cyclic ref.
                // The rest of the members is kept intact as they are harmless.
                destroy: function destructParseErrorInfo() {
                    // remove cyclic references added to error info:
                    // info.yy = null;
                    // info.lexer = null;
                    // info.value = null;
                    // info.value_stack = null;
                    // ...
                    var rec = !!this.recoverable;
                    for (var key in this) {
                        if (this.hasOwnProperty(key) && typeof key === 'object') {
                            this[key] = undefined;
                        }
                    }
                    this.recoverable = rec;
                }
            };
            // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
            this.__error_infos.push(pei);
            return pei;
        };

        // clone some parts of the (possibly enhanced!) errorInfo object
        // to give them some persistence.
        this.shallowCopyErrorInfo = function parser_shallowCopyErrorInfo(p) {
            var rv = shallow_copy(p);

            // remove the large parts which can only cause cyclic references
            // and are otherwise available from the parser kernel anyway.
            delete rv.sharedState_yy;
            delete rv.parser;
            delete rv.lexer;

            // lexer.yytext MAY be a complex value object, rather than a simple string/value:
            rv.value = shallow_copy(rv.value);

            // yylloc info:
            rv.loc = copy_yylloc(rv.loc);

            // the 'expected' set won't be modified, so no need to clone it:
            //rv.expected = rv.expected.slice(0);

            //symbol stack is a simple array:
            rv.symbol_stack = rv.symbol_stack.slice(0);
            // ditto for state stack:
            rv.state_stack = rv.state_stack.slice(0);
            // clone the yylloc's in the location stack?:
            rv.location_stack = rv.location_stack.map(copy_yylloc);
            // and the value stack may carry both simple and complex values:
            // shallow-copy the latter.
            rv.value_stack = rv.value_stack.map(shallow_copy);

            // and we don't bother with the sharedState_yy reference:
            //delete rv.yy;

            // now we prepare for tracking the COMBINE actions
            // in the error recovery code path:
            //
            // as we want to keep the maximum error info context, we
            // *scan* the state stack to find the first *empty* slot.
            // This position will surely be AT OR ABOVE the current
            // stack pointer, but we want to keep the 'used but discarded'
            // part of the parse stacks *intact* as those slots carry
            // error context that may be useful when you want to produce
            // very detailed error diagnostic reports.
            //
            // ### Purpose of each stack pointer:
            //
            // - stack_pointer: points at the top of the parse stack
            //                  **as it existed at the time of the error
            //                  occurrence, i.e. at the time the stack
            //                  snapshot was taken and copied into the
            //                  errorInfo object.**
            // - base_pointer:  the bottom of the **empty part** of the
            //                  stack, i.e. **the start of the rest of
            //                  the stack space /above/ the existing
            //                  parse stack. This section will be filled
            //                  by the error recovery process as it
            //                  travels the parse state machine to
            //                  arrive at the resolving error recovery rule.**
            // - info_stack_pointer:
            //                  this stack pointer points to the **top of
            //                  the error ecovery tracking stack space**, i.e.
            //                  this stack pointer takes up the role of
            //                  the `stack_pointer` for the error recovery
            //                  process. Any mutations in the **parse stack**
            //                  are **copy-appended** to this part of the
            //                  stack space, keeping the bottom part of the
            //                  stack (the 'snapshot' part where the parse
            //                  state at the time of error occurrence was kept)
            //                  intact.
            // - root_failure_pointer:
            //                  copy of the `stack_pointer`...
            //
            for (var i = rv.stack_pointer; typeof rv.state_stack[i] !== 'undefined'; i++) {
                // empty
            }
            rv.base_pointer = i;
            rv.info_stack_pointer = i;

            rv.root_failure_pointer = rv.stack_pointer;

            // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
            this.__error_recovery_infos.push(rv);

            return rv;
        };


        function stdLex() {
            var token = lexer.lex();
            // if token isn't its numeric value, convert
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }

            return token || EOF;
        }

        function fastLex() {
            var token = lexer.fastLex();
            // if token isn't its numeric value, convert
            if (typeof token !== 'number') {
                token = self.symbols_[token] || token;
            }

            return token || EOF;
        }

        var lex = stdLex;


        var state, action, r, t;
        var yyval = {
            $: true,
            _$: undefined,
            yy: sharedState_yy
        };
        var p;
        var yyrulelen;
        var this_production;
        var newState;
        var retval = false;


        // Return the rule stack depth where the nearest error rule can be found.
        // Return -1 when no error recovery rule was found.
        function locateNearestErrorRecoveryRule(state) {
            var stack_probe = sp - 1;
            var depth = 0;

            // try to recover from error
            while (stack_probe >= 0) {
                // check for error recovery rule in this state









                var t = table[state][TERROR] || NO_ACTION;
                if (t[0]) {
                    // We need to make sure we're not cycling forever:
                    // once we hit EOF, even when we `yyerrok()` an error, we must
                    // prevent the core from running forever,
                    // e.g. when parent rules are still expecting certain input to
                    // follow after this, for example when you handle an error inside a set
                    // of braces which are matched by a parent rule in your grammar.
                    //
                    // Hence we require that every error handling/recovery attempt
                    // *after we've hit EOF* has a diminishing state stack: this means
                    // we will ultimately have unwound the state stack entirely and thus
                    // terminate the parse in a controlled fashion even when we have
                    // very complex error/recovery code interplay in the core + user
                    // action code blocks:









                    if (symbol === EOF) {
                        if (lastEofErrorStateDepth > sp - 1 - depth) {
                            lastEofErrorStateDepth = sp - 1 - depth;
                        } else {









                            --stack_probe; // popStack(1): [symbol, action]
                            state = sstack[stack_probe];
                            ++depth;
                            continue;
                        }
                    }
                    return depth;
                }
                if (state === 0 /* $accept rule */ || stack_probe < 1) {









                    return -1; // No suitable error recovery rule available.
                }
                --stack_probe; // popStack(1): [symbol, action]
                state = sstack[stack_probe];
                ++depth;
            }









            return -1; // No suitable error recovery rule available.
        }


        try {
            this.__reentrant_call_depth++;

            lexer.setInput(input, sharedState_yy);

            // NOTE: we *assume* no lexer pre/post handlers are set up *after* 
            // this initial `setInput()` call: hence we can now check and decide
            // whether we'll go with the standard, slower, lex() API or the
            // `fast_lex()` one:
            if (typeof lexer.canIUse === 'function') {
                var lexerInfo = lexer.canIUse();
                if (lexerInfo.fastLex && typeof fastLex === 'function') {
                    lex = fastLex;
                }
            } 

            yyloc = lexer.yylloc;
            lstack[sp] = yyloc;
            vstack[sp] = null;
            sstack[sp] = 0;
            stack[sp] = 0;
            ++sp;





            if (this.pre_parse) {
                this.pre_parse.call(this, sharedState_yy);
            }
            if (sharedState_yy.pre_parse) {
                sharedState_yy.pre_parse.call(this, sharedState_yy);
            }

            newState = sstack[sp - 1];
            for (;;) {
                // retrieve state number from top of stack
                state = newState;               // sstack[sp - 1];

                // use default actions if available
                if (this.defaultActions[state]) {
                    action = 2;
                    newState = this.defaultActions[state];
                } else {
                    // The single `==` condition below covers both these `===` comparisons in a single
                    // operation:
                    //
                    //     if (symbol === null || typeof symbol === 'undefined') ...
                    if (!symbol) {
                        symbol = lex();
                    }
                    // read action for current state and first input
                    t = (table[state] && table[state][symbol]) || NO_ACTION;
                    newState = t[1];
                    action = t[0];











                    // handle parse error
                    if (!action) {
                        // first see if there's any chance at hitting an error recovery rule:
                        var error_rule_depth = locateNearestErrorRecoveryRule(state);
                        var errStr = null;
                        var errSymbolDescr = (this.describeSymbol(symbol) || symbol);
                        var expected = this.collect_expected_token_set(state);

                        if (!recovering) {
                            // Report error
                            if (typeof lexer.yylineno === 'number') {
                                errStr = 'Parse error on line ' + (lexer.yylineno + 1) + ': ';
                            } else {
                                errStr = 'Parse error: ';
                            }

                            if (typeof lexer.showPosition === 'function') {
                                errStr += '\n' + lexer.showPosition(79 - 10, 10) + '\n';
                            }
                            if (expected.length) {
                                errStr += 'Expecting ' + expected.join(', ') + ', got unexpected ' + errSymbolDescr;
                            } else {
                                errStr += 'Unexpected ' + errSymbolDescr;
                            }

                            p = this.constructParseErrorInfo(errStr, null, expected, (error_rule_depth >= 0));

                            // DO NOT cleanup the old one before we start the new error info track:
                            // the old one will *linger* on the error stack and stay alive until we 
                            // invoke the parser's cleanup API!
                            recoveringErrorInfo = this.shallowCopyErrorInfo(p);










                            r = this.parseError(p.errStr, p, this.JisonParserError);
                            if (typeof r !== 'undefined') {
                                retval = r;
                                break;
                            }

                            // Protect against overly blunt userland `parseError` code which *sets*
                            // the `recoverable` flag without properly checking first:
                            // we always terminate the parse when there's no recovery rule available anyhow!
                            if (!p.recoverable || error_rule_depth < 0) {
                                break;
                            } else {
                                // TODO: allow parseError callback to edit symbol and or state at the start of the error recovery process...
                            }
                        }










                        var esp = recoveringErrorInfo.info_stack_pointer;

                        // just recovered from another error
                        if (recovering === ERROR_RECOVERY_TOKEN_DISCARD_COUNT && error_rule_depth >= 0) {
                            // SHIFT current lookahead and grab another
                            recoveringErrorInfo.symbol_stack[esp] = symbol;
                            recoveringErrorInfo.value_stack[esp] = shallow_copy(lexer.yytext);
                            recoveringErrorInfo.location_stack[esp] = copy_yylloc(lexer.yylloc);
                            recoveringErrorInfo.state_stack[esp] = newState; // push state
                            ++esp;

                            // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:



                            yyloc = lexer.yylloc;

                            preErrorSymbol = 0;
                            symbol = lex();









                        }

                        // try to recover from error
                        if (error_rule_depth < 0) {
                            ASSERT(recovering > 0, "line 897");
                            recoveringErrorInfo.info_stack_pointer = esp;

                            // barf a fatal hairball when we're out of look-ahead symbols and none hit a match
                            // while we are still busy recovering from another error:
                            var po = this.__error_infos[this.__error_infos.length - 1];

                            // Report error
                            if (typeof lexer.yylineno === 'number') {
                                errStr = 'Parsing halted on line ' + (lexer.yylineno + 1) + ' while starting to recover from another error';
                            } else {
                                errStr = 'Parsing halted while starting to recover from another error';
                            }

                            if (po) {
                                errStr += ' -- previous error which resulted in this fatal result: ' + po.errStr;
                            } else {
                                errStr += ': ';
                            }

                            if (typeof lexer.showPosition === 'function') {
                                errStr += '\n' + lexer.showPosition(79 - 10, 10) + '\n';
                            }
                            if (expected.length) {
                                errStr += 'Expecting ' + expected.join(', ') + ', got unexpected ' + errSymbolDescr;
                            } else {
                                errStr += 'Unexpected ' + errSymbolDescr;
                            }

                            p = this.constructParseErrorInfo(errStr, null, expected, false);
                            if (po) {
                                p.extra_error_attributes = po;
                            }

                            r = this.parseError(p.errStr, p, this.JisonParserError);
                            if (typeof r !== 'undefined') {
                                retval = r;
                            }
                            break;
                        }

                        preErrorSymbol = (symbol === TERROR ? 0 : symbol); // save the lookahead token
                        symbol = TERROR;            // insert generic error symbol as new lookahead

                        const EXTRA_STACK_SAMPLE_DEPTH = 3;

                        // REDUCE/COMBINE the pushed terms/tokens to a new ERROR token:
                        recoveringErrorInfo.symbol_stack[esp] = preErrorSymbol;
                        if (errStr) {
                            recoveringErrorInfo.value_stack[esp] = {
                                yytext: shallow_copy(lexer.yytext),
                                errorRuleDepth: error_rule_depth,
                                errStr: errStr,
                                errorSymbolDescr: errSymbolDescr,
                                expectedStr: expected,
                                stackSampleLength: error_rule_depth + EXTRA_STACK_SAMPLE_DEPTH
                            };









                        } else {
                            recoveringErrorInfo.value_stack[esp] = {
                                yytext: shallow_copy(lexer.yytext),
                                errorRuleDepth: error_rule_depth,
                                stackSampleLength: error_rule_depth + EXTRA_STACK_SAMPLE_DEPTH
                            };
                        }
                        recoveringErrorInfo.location_stack[esp] = copy_yylloc(lexer.yylloc);
                        recoveringErrorInfo.state_stack[esp] = newState || NO_ACTION[1];

                        ++esp;
                        recoveringErrorInfo.info_stack_pointer = esp;

                        yyval.$ = recoveringErrorInfo;
                        yyval._$ = undefined;

                        yyrulelen = error_rule_depth;









                        r = this.performAction.call(yyval, yyloc, NO_ACTION[1], sp - 1, vstack, lstack);

                        if (typeof r !== 'undefined') {
                            retval = r;
                            break;
                        }

                        // pop off stack
                        sp -= yyrulelen;

                        // and move the top entries + discarded part of the parse stacks onto the error info stack:
                        for (var idx = sp - EXTRA_STACK_SAMPLE_DEPTH, top = idx + yyrulelen; idx < top; idx++, esp++) {
                            recoveringErrorInfo.symbol_stack[esp] = stack[idx];
                            recoveringErrorInfo.value_stack[esp] = shallow_copy(vstack[idx]);
                            recoveringErrorInfo.location_stack[esp] = copy_yylloc(lstack[idx]);
                            recoveringErrorInfo.state_stack[esp] = sstack[idx];
                        }

                        recoveringErrorInfo.symbol_stack[esp] = TERROR;
                        recoveringErrorInfo.value_stack[esp] = shallow_copy(yyval.$);
                        recoveringErrorInfo.location_stack[esp] = copy_yylloc(yyval._$);

                        // goto new state = table[STATE][NONTERMINAL]
                        newState = sstack[sp - 1];

                        if (this.defaultActions[newState]) {
                            recoveringErrorInfo.state_stack[esp] = this.defaultActions[newState];
                        } else {
                            t = (table[newState] && table[newState][symbol]) || NO_ACTION;
                            recoveringErrorInfo.state_stack[esp] = t[1];
                        }

                        ++esp;
                        recoveringErrorInfo.info_stack_pointer = esp;

                        // allow N (default: 3) real symbols to be shifted before reporting a new error
                        recovering = ERROR_RECOVERY_TOKEN_DISCARD_COUNT;










                        // Now duplicate the standard parse machine here, at least its initial
                        // couple of rounds until the TERROR symbol is **pushed onto the parse stack**,
                        // as we wish to push something special then!
                        //
                        // Run the state machine in this copy of the parser state machine
                        // until we *either* consume the error symbol (and its related information)
                        // *or* we run into another error while recovering from this one
                        // *or* we execute a `reduce` action which outputs a final parse
                        // result (yes, that MAY happen!).
                        //
                        // We stay in this secondary parse loop until we have completed
                        // the *error recovery phase* as the main parse loop (further below)
                        // is optimized for regular parse operation and DOES NOT cope with
                        // error recovery *at all*.
                        //
                        // We call the secondary parse loop just below the "slow parse loop",
                        // while the main parse loop, which is an almost-duplicate of this one,
                        // yet optimized for regular parse operation, is called the "fast
                        // parse loop".
                        //
                        // Compare this to `bison` & (vanilla) `jison`, both of which have
                        // only a single parse loop, which handles everything. Our goal is
                        // to eke out every drop of performance in the main parse loop...

                        ASSERT(recoveringErrorInfo, "line 1049");
                        ASSERT(symbol === TERROR, "line 1050");
                        ASSERT(!action, "line 1051");
                        var errorSymbolFromParser = true;
                        for (;;) {
                            // retrieve state number from top of stack
                            state = newState;               // sstack[sp - 1];

                            // use default actions if available
                            if (this.defaultActions[state]) {
                                action = 2;
                                newState = this.defaultActions[state];
                            } else {
                                // The single `==` condition below covers both these `===` comparisons in a single
                                // operation:
                                //
                                //     if (symbol === null || typeof symbol === 'undefined') ...
                                if (!symbol) {
                                    symbol = lex();
                                    // **Warning: Edge Case**: the *lexer* may produce
                                    // TERROR tokens of its own volition: *those* TERROR
                                    // tokens should be treated like *regular tokens*
                                    // i.e. tokens which have a lexer-provided `yyvalue`
                                    // and `yylloc`:
                                    errorSymbolFromParser = false;
                                }
                                // read action for current state and first input
                                t = (table[state] && table[state][symbol]) || NO_ACTION;
                                newState = t[1];
                                action = t[0];










                                // encountered another parse error? If so, break out to main loop
                                // and take it from there!
                                if (!action) {










                                    ASSERT(recoveringErrorInfo, "line 1087");

                                    // Prep state variables so that upon breaking out of
                                    // this "slow parse loop" and hitting the `continue;`
                                    // statement in the outer "fast parse loop" we redo
                                    // the exact same state table lookup as the one above
                                    // so that the outer=main loop will also correctly
                                    // detect the 'parse error' state (`!action`) we have
                                    // just encountered above.
                                    newState = state;
                                    break;
                                }
                            }










                            switch (action) {
                            // catch misc. parse failures:
                            default:
                                // this shouldn't happen, unless resolve defaults are off
                                //
                                // SILENTLY SIGNAL that the outer "fast parse loop" should
                                // take care of this internal error condition:
                                // prevent useless code duplication now/here.
                                break;

                            // shift:
                            case 1:
                                stack[sp] = symbol;
                                // ### Note/Warning ###
                                //
                                // The *lexer* may also produce TERROR tokens on its own,
                                // so we specifically test for the TERROR we did set up
                                // in the error recovery logic further above!
                                if (symbol === TERROR && errorSymbolFromParser) {
                                    // Push a special value onto the stack when we're
                                    // shifting the `error` symbol that is related to the
                                    // error we're recovering from.
                                    ASSERT(recoveringErrorInfo, "line 1131");
                                    vstack[sp] = recoveringErrorInfo;
                                    lstack[sp] = this.yyMergeLocationInfo(null, null, recoveringErrorInfo.loc, lexer.yylloc, true);
                                } else {
                                    ASSERT(symbol !== 0, "line 1135");
                                    ASSERT(preErrorSymbol === 0, "line 1136");
                                    vstack[sp] = lexer.yytext;
                                    lstack[sp] = copy_yylloc(lexer.yylloc);
                                }
                                sstack[sp] = newState; // push state

                                ++sp;
                                symbol = 0;
                                // **Warning: Edge Case**: the *lexer* may have produced
                                // TERROR tokens of its own volition: *those* TERROR
                                // tokens should be treated like *regular tokens*
                                // i.e. tokens which have a lexer-provided `yyvalue`
                                // and `yylloc`:
                                errorSymbolFromParser = false;
                                if (!preErrorSymbol) { // normal execution / no error
                                    // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:



                                    yyloc = lexer.yylloc;

                                    if (recovering > 0) {
                                        recovering--;









                                    }
                                } else {
                                    // error just occurred, resume old lookahead f/ before error, *unless* that drops us straight back into error mode:
                                    ASSERT(recovering > 0, "line 1163");
                                    symbol = preErrorSymbol;
                                    preErrorSymbol = 0;









                                    // read action for current state and first input
                                    t = (table[newState] && table[newState][symbol]) || NO_ACTION;
                                    if (!t[0] || symbol === TERROR) {
                                        // forget about that symbol and move forward: this wasn't a 'forgot to insert' error type where
                                        // (simple) stuff might have been missing before the token which caused the error we're
                                        // recovering from now...
                                        //
                                        // Also check if the LookAhead symbol isn't the ERROR token we set as part of the error
                                        // recovery, for then this we would we idling (cycling) on the error forever.
                                        // Yes, this does not take into account the possibility that the *lexer* may have
                                        // produced a *new* TERROR token all by itself, but that would be a very peculiar grammar!









                                        symbol = 0;
                                    }
                                }

                                // once we have pushed the special ERROR token value,
                                // we REMAIN in this inner, "slow parse loop" until
                                // the entire error recovery phase has completed.
                                //
                                // ### Note About Edge Case ###
                                //
                                // Userland action code MAY already have 'reset' the
                                // error recovery phase marker `recovering` to ZERO(0)
                                // while the error symbol hasn't been shifted onto
                                // the stack yet. Hence we only exit this "slow parse loop"
                                // when *both* conditions are met!
                                ASSERT(preErrorSymbol === 0, "line 1194");
                                if (recovering === 0) {
                                    break;
                                }
                                continue;

                            // reduce:
                            case 2:
                                this_production = this.productions_[newState - 1];  // `this.productions_[]` is zero-based indexed while states start from 1 upwards...
                                yyrulelen = this_production[1];










                                r = this.performAction.call(yyval, yyloc, newState, sp - 1, vstack, lstack);

                                if (typeof r !== 'undefined') {
                                    // signal end of error recovery loop AND end of outer parse loop
                                    action = 3;
                                    sp = -2;      // magic number: signal outer "fast parse loop" ACCEPT state that we already have a properly set up `retval` parser return value.
                                    retval = r;
                                    break;
                                }

                                // pop off stack
                                sp -= yyrulelen;

                                // don't overwrite the `symbol` variable: use a local var to speed things up:
                                var ntsymbol = this_production[0];    // push nonterminal (reduce)
                                stack[sp] = ntsymbol;
                                vstack[sp] = yyval.$;
                                lstack[sp] = yyval._$;
                                // goto new state = table[STATE][NONTERMINAL]
                                newState = table[sstack[sp - 1]][ntsymbol];
                                sstack[sp] = newState;
                                ++sp;









                                continue;

                            // accept:
                            case 3:
                                retval = true;
                                // Return the `$accept` rule's `$$` result, if available.
                                //
                                // Also note that JISON always adds this top-most `$accept` rule (with implicit,
                                // default, action):
                                //
                                //     $accept: <startSymbol> $end
                                //                  %{ $$ = $1; @$ = @1; %}
                                //
                                // which, combined with the parse kernel's `$accept` state behaviour coded below,
                                // will produce the `$$` value output of the <startSymbol> rule as the parse result,
                                // IFF that result is *not* `undefined`. (See also the parser kernel code.)
                                //
                                // In code:
                                //
                                //                  %{
                                //                      @$ = @1;            // if location tracking support is included
                                //                      if (typeof $1 !== 'undefined')
                                //                          return $1;
                                //                      else
                                //                          return true;           // the default parse result if the rule actions don't produce anything
                                //                  %}
                                sp--;
                                if (sp >= 0 && typeof vstack[sp] !== 'undefined') {
                                    retval = vstack[sp];
                                }
                                sp = -2;      // magic number: signal outer "fast parse loop" ACCEPT state that we already have a properly set up `retval` parser return value.
                                break;
                            }

                            // break out of loop: we accept or fail with error
                            break;
                        }

                        // should we also break out of the regular/outer parse loop,
                        // i.e. did the parser already produce a parse result in here?!
                        // *or* did we hit an unsupported parse state, to be handled
                        // in the `switch/default` code further below?
                        ASSERT(action !== 2, "line 1272");
                        if (!action || action === 1) {
                            continue;
                        }
                    }


                }










                switch (action) {
                // catch misc. parse failures:
                default:
                    // this shouldn't happen, unless resolve defaults are off
                    if (action instanceof Array) {
                        p = this.constructParseErrorInfo('Parse Error: multiple actions possible at state: ' + state + ', token: ' + symbol, null, null, false);
                        r = this.parseError(p.errStr, p, this.JisonParserError);
                        if (typeof r !== 'undefined') {
                            retval = r;
                        }
                        break;
                    }
                    // Another case of better safe than sorry: in case state transitions come out of another error recovery process
                    // or a buggy LUT (LookUp Table):
                    p = this.constructParseErrorInfo('Parsing halted. No viable error recovery approach available due to internal system failure.', null, null, false);
                    r = this.parseError(p.errStr, p, this.JisonParserError);
                    if (typeof r !== 'undefined') {
                        retval = r;
                    }
                    break;

                // shift:
                case 1:
                    stack[sp] = symbol;
                    vstack[sp] = lexer.yytext;
                    lstack[sp] = copy_yylloc(lexer.yylloc);
                    sstack[sp] = newState; // push state

                    ++sp;
                    symbol = 0;

                    ASSERT(preErrorSymbol === 0, "line 1352");         // normal execution / no error
                    ASSERT(recovering === 0, "line 1353");             // normal execution / no error

                    // Pick up the lexer details for the current symbol as that one is not 'look-ahead' any more:



                    yyloc = lexer.yylloc;
                    continue;

                // reduce:
                case 2:
                    ASSERT(preErrorSymbol === 0, "line 1364");         // normal execution / no error
                    ASSERT(recovering === 0, "line 1365");             // normal execution / no error

                    this_production = this.productions_[newState - 1];  // `this.productions_[]` is zero-based indexed while states start from 1 upwards...
                    yyrulelen = this_production[1];










                    r = this.performAction.call(yyval, yyloc, newState, sp - 1, vstack, lstack);

                    if (typeof r !== 'undefined') {
                        retval = r;
                        break;
                    }

                    // pop off stack
                    sp -= yyrulelen;

                    // don't overwrite the `symbol` variable: use a local var to speed things up:
                    var ntsymbol = this_production[0];    // push nonterminal (reduce)
                    stack[sp] = ntsymbol;
                    vstack[sp] = yyval.$;
                    lstack[sp] = yyval._$;
                    // goto new state = table[STATE][NONTERMINAL]
                    newState = table[sstack[sp - 1]][ntsymbol];
                    sstack[sp] = newState;
                    ++sp;









                    continue;

                // accept:
                case 3:
                    if (sp !== -2) {
                        retval = true;
                        // Return the `$accept` rule's `$$` result, if available.
                        //
                        // Also note that JISON always adds this top-most `$accept` rule (with implicit,
                        // default, action):
                        //
                        //     $accept: <startSymbol> $end
                        //                  %{ $$ = $1; @$ = @1; %}
                        //
                        // which, combined with the parse kernel's `$accept` state behaviour coded below,
                        // will produce the `$$` value output of the <startSymbol> rule as the parse result,
                        // IFF that result is *not* `undefined`. (See also the parser kernel code.)
                        //
                        // In code:
                        //
                        //                  %{
                        //                      @$ = @1;            // if location tracking support is included
                        //                      if (typeof $1 !== 'undefined')
                        //                          return $1;
                        //                      else
                        //                          return true;           // the default parse result if the rule actions don't produce anything
                        //                  %}
                        sp--;
                        if (typeof vstack[sp] !== 'undefined') {
                            retval = vstack[sp];
                        }
                    }
                    break;
                }

                // break out of loop: we accept or fail with error
                break;
            }
        } catch (ex) {
            // report exceptions through the parseError callback too, but keep the exception intact
            // if it is a known parser or lexer error which has been thrown by parseError() already:
            if (ex instanceof this.JisonParserError) {
                throw ex;
            }
            else if (lexer && typeof lexer.JisonLexerError === 'function' && ex instanceof lexer.JisonLexerError) {
                throw ex;
            }

            p = this.constructParseErrorInfo('Parsing aborted due to exception.', ex, null, false);
            retval = false;
            r = this.parseError(p.errStr, p, this.JisonParserError);
            if (typeof r !== 'undefined') {
                retval = r;
            }
        } finally {
            retval = this.cleanupAfterParse(retval, true, true);
            this.__reentrant_call_depth--;
        }   // /finally

        return retval;
    },
    yyError: 1
    };
    parser$3.originalParseError = parser$3.parseError;
    parser$3.originalQuoteName = parser$3.quoteName;
    /* lexer generated by jison-lex 0.6.2-220 */

    /*
     * Returns a Lexer object of the following structure:
     *
     *  Lexer: {
     *    yy: {}     The so-called "shared state" or rather the *source* of it;
     *               the real "shared state" `yy` passed around to
     *               the rule actions, etc. is a direct reference!
     *
     *               This "shared context" object was passed to the lexer by way of 
     *               the `lexer.setInput(str, yy)` API before you may use it.
     *
     *               This "shared context" object is passed to the lexer action code in `performAction()`
     *               so userland code in the lexer actions may communicate with the outside world 
     *               and/or other lexer rules' actions in more or less complex ways.
     *
     *  }
     *
     *  Lexer.prototype: {
     *    EOF: 1,
     *    ERROR: 2,
     *
     *    yy:        The overall "shared context" object reference.
     *
     *    JisonLexerError: function(msg, hash),
     *
     *    performAction: function lexer__performAction(yy, yyrulenumber, YY_START),
     *
     *               The function parameters and `this` have the following value/meaning:
     *               - `this`    : reference to the `lexer` instance. 
     *                               `yy_` is an alias for `this` lexer instance reference used internally.
     *
     *               - `yy`      : a reference to the `yy` "shared state" object which was passed to the lexer
     *                             by way of the `lexer.setInput(str, yy)` API before.
     *
     *                             Note:
     *                             The extra arguments you specified in the `%parse-param` statement in your
     *                             **parser** grammar definition file are passed to the lexer via this object
     *                             reference as member variables.
     *
     *               - `yyrulenumber`   : index of the matched lexer rule (regex), used internally.
     *
     *               - `YY_START`: the current lexer "start condition" state.
     *
     *    parseError: function(str, hash, ExceptionClass),
     *
     *    constructLexErrorInfo: function(error_message, is_recoverable),
     *               Helper function.
     *               Produces a new errorInfo 'hash object' which can be passed into `parseError()`.
     *               See it's use in this lexer kernel in many places; example usage:
     *
     *                   var infoObj = lexer.constructParseErrorInfo('fail!', true);
     *                   var retVal = lexer.parseError(infoObj.errStr, infoObj, lexer.JisonLexerError);
     *
     *    options: { ... lexer %options ... },
     *
     *    lex: function(),
     *               Produce one token of lexed input, which was passed in earlier via the `lexer.setInput()` API.
     *               You MAY use the additional `args...` parameters as per `%parse-param` spec of the **lexer** grammar:
     *               these extra `args...` are added verbatim to the `yy` object reference as member variables.
     *
     *               WARNING:
     *               Lexer's additional `args...` parameters (via lexer's `%parse-param`) MAY conflict with
     *               any attributes already added to `yy` by the **parser** or the jison run-time; 
     *               when such a collision is detected an exception is thrown to prevent the generated run-time 
     *               from silently accepting this confusing and potentially hazardous situation! 
     *
     *    cleanupAfterLex: function(do_not_nuke_errorinfos),
     *               Helper function.
     *
     *               This helper API is invoked when the **parse process** has completed: it is the responsibility
     *               of the **parser** (or the calling userland code) to invoke this method once cleanup is desired. 
     *
     *               This helper may be invoked by user code to ensure the internal lexer gets properly garbage collected.
     *
     *    setInput: function(input, [yy]),
     *
     *
     *    input: function(),
     *
     *
     *    unput: function(str),
     *
     *
     *    more: function(),
     *
     *
     *    reject: function(),
     *
     *
     *    less: function(n),
     *
     *
     *    pastInput: function(n),
     *
     *
     *    upcomingInput: function(n),
     *
     *
     *    showPosition: function(),
     *
     *
     *    test_match: function(regex_match_array, rule_index),
     *
     *
     *    next: function(),
     *
     *
     *    begin: function(condition),
     *
     *
     *    pushState: function(condition),
     *
     *
     *    popState: function(),
     *
     *
     *    topState: function(),
     *
     *
     *    _currentRules: function(),
     *
     *
     *    stateStackSize: function(),
     *
     *
     *    performAction: function(yy, yy_, yyrulenumber, YY_START),
     *
     *
     *    rules: [...],
     *
     *
     *    conditions: {associative list: name ==> set},
     *  }
     *
     *
     *  token location info (`yylloc`): {
     *    first_line: n,
     *    last_line: n,
     *    first_column: n,
     *    last_column: n,
     *    range: [start_number, end_number]
     *               (where the numbers are indexes into the input string, zero-based)
     *  }
     *
     * ---
     *
     * The `parseError` function receives a 'hash' object with these members for lexer errors:
     *
     *  {
     *    text:        (matched text)
     *    token:       (the produced terminal token, if any)
     *    token_id:    (the produced terminal token numeric ID, if any)
     *    line:        (yylineno)
     *    loc:         (yylloc)
     *    recoverable: (boolean: TRUE when the parser MAY have an error recovery rule
     *                  available for this particular error)
     *    yy:          (object: the current parser internal "shared state" `yy`
     *                  as is also available in the rule actions; this can be used,
     *                  for instance, for advanced error analysis and reporting)
     *    lexer:       (reference to the current lexer instance used by the parser)
     *  }
     *
     * while `this` will reference the current lexer instance.
     *
     * When `parseError` is invoked by the lexer, the default implementation will
     * attempt to invoke `yy.parser.parseError()`; when this callback is not provided
     * it will try to invoke `yy.parseError()` instead. When that callback is also not
     * provided, a `JisonLexerError` exception will be thrown containing the error
     * message and `hash`, as constructed by the `constructLexErrorInfo()` API.
     *
     * Note that the lexer's `JisonLexerError` error class is passed via the
     * `ExceptionClass` argument, which is invoked to construct the exception
     * instance to be thrown, so technically `parseError` will throw the object
     * produced by the `new ExceptionClass(str, hash)` JavaScript expression.
     *
     * ---
     *
     * You can specify lexer options by setting / modifying the `.options` object of your Lexer instance.
     * These options are available:
     *
     * (Options are permanent.)
     *  
     *  yy: {
     *      parseError: function(str, hash, ExceptionClass)
     *                 optional: overrides the default `parseError` function.
     *  }
     *
     *  lexer.options: {
     *      pre_lex:  function()
     *                 optional: is invoked before the lexer is invoked to produce another token.
     *                 `this` refers to the Lexer object.
     *      post_lex: function(token) { return token; }
     *                 optional: is invoked when the lexer has produced a token `token`;
     *                 this function can override the returned token value by returning another.
     *                 When it does not return any (truthy) value, the lexer will return
     *                 the original `token`.
     *                 `this` refers to the Lexer object.
     *
     * WARNING: the next set of options are not meant to be changed. They echo the abilities of
     * the lexer as per when it was compiled!
     *
     *      ranges: boolean
     *                 optional: `true` ==> token location info will include a .range[] member.
     *      flex: boolean
     *                 optional: `true` ==> flex-like lexing behaviour where the rules are tested
     *                 exhaustively to find the longest match.
     *      backtrack_lexer: boolean
     *                 optional: `true` ==> lexer regexes are tested in order and for invoked;
     *                 the lexer terminates the scan when a token is returned by the action code.
     *      xregexp: boolean
     *                 optional: `true` ==> lexer rule regexes are "extended regex format" requiring the
     *                 `XRegExp` library. When this %option has not been specified at compile time, all lexer
     *                 rule regexes have been written as standard JavaScript RegExp expressions.
     *  }
     */


    var lexer$2 = function() {
      /**
       * See also:
       * http://stackoverflow.com/questions/1382107/whats-a-good-way-to-extend-error-in-javascript/#35881508
       * but we keep the prototype.constructor and prototype.name assignment lines too for compatibility
       * with userland code which might access the derived class in a 'classic' way.
       *
       * @public
       * @constructor
       * @nocollapse
       */
      function JisonLexerError(msg, hash) {

        Object.defineProperty(this, 'name', {
          enumerable: false,
          writable: false,
          value: 'JisonLexerError'
        });

        if (msg == null)
          msg = '???';

        Object.defineProperty(this, 'message', {
          enumerable: false,
          writable: true,
          value: msg
        });

        this.hash = hash;
        var stacktrace;

        if (hash && hash.exception instanceof Error) {
          var ex2 = hash.exception;
          this.message = ex2.message || msg;
          stacktrace = ex2.stack;
        }

        if (!stacktrace) {
          if (Error.hasOwnProperty('captureStackTrace')) {
            // V8
            Error.captureStackTrace(this, this.constructor);
          } else {
            stacktrace = new Error(msg).stack;
          }
        }

        if (stacktrace) {
          Object.defineProperty(this, 'stack', {
            enumerable: false,
            writable: false,
            value: stacktrace
          });
        }
      }

      if (typeof Object.setPrototypeOf === 'function') {
        Object.setPrototypeOf(JisonLexerError.prototype, Error.prototype);
      } else {
        JisonLexerError.prototype = Object.create(Error.prototype);
      }

      JisonLexerError.prototype.constructor = JisonLexerError;
      JisonLexerError.prototype.name = 'JisonLexerError';

      var lexer = {
        
    // Code Generator Information Report
    // ---------------------------------
    //
    // Options:
    //
    //   backtracking: .................... false
    //   location.ranges: ................. true
    //   location line+column tracking: ... true
    //
    //
    // Forwarded Parser Analysis flags:
    //
    //   uses yyleng: ..................... false
    //   uses yylineno: ................... false
    //   uses yytext: ..................... false
    //   uses yylloc: ..................... false
    //   uses lexer values: ............... true / true
    //   location tracking: ............... true
    //   location assignment: ............. true
    //
    //
    // Lexer Analysis flags:
    //
    //   uses yyleng: ..................... ???
    //   uses yylineno: ................... ???
    //   uses yytext: ..................... ???
    //   uses yylloc: ..................... ???
    //   uses ParseError API: ............. ???
    //   uses yyerror: .................... ???
    //   uses location tracking & editing:  ???
    //   uses more() API: ................. ???
    //   uses unput() API: ................ ???
    //   uses reject() API: ............... ???
    //   uses less() API: ................. ???
    //   uses display APIs pastInput(), upcomingInput(), showPosition():
    //        ............................. ???
    //   uses describeYYLLOC() API: ....... ???
    //
    // --------- END OF REPORT -----------

    EOF: 1,
        ERROR: 2,

        // JisonLexerError: JisonLexerError,        /// <-- injected by the code generator

        // options: {},                             /// <-- injected by the code generator

        // yy: ...,                                 /// <-- injected by setInput()

        /// INTERNAL USE ONLY: internal rule set cache for the current lexer state
        __currentRuleSet__: null,

        /// INTERNAL USE ONLY: the set of lexErrorInfo objects created since the last cleanup
        __error_infos: [],

        /// INTERNAL USE ONLY: mark whether the lexer instance has been 'unfolded' completely and is now ready for use
        __decompressed: false,

        /// INTERNAL USE ONLY
        done: false,

        /// INTERNAL USE ONLY
        _backtrack: false,

        /// INTERNAL USE ONLY
        _input: '',

        /// INTERNAL USE ONLY
        _more: false,

        /// INTERNAL USE ONLY
        _signaled_error_token: false,

        /// INTERNAL USE ONLY; managed via `pushState()`, `popState()`, `topState()` and `stateStackSize()`
        conditionStack: [],

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction. `match` is identical to `yytext` except that this one still contains the matched input string after `lexer.performAction()` has been invoked, where userland code MAY have changed/replaced the `yytext` value entirely!
        match: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks entire input which has been matched so far
        matched: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks RE match result for last (successful) match attempt
        matches: false,

        /// ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction; this value is transferred to the parser as the 'token value' when the parser consumes the lexer token produced through a call to the `lex()` API.
        yytext: '',

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks the 'cursor position' in the input string, i.e. the number of characters matched so far
        offset: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: length of matched input for the token under construction (`yytext`)
        yyleng: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: 'line number' at which the token under construction is located
        yylineno: 0,

        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks location info (lines + columns) for the token under construction
        yylloc: null,

        /**
             * INTERNAL USE: construct a suitable error info hash object instance for `parseError`.
             * 
             * @public
             * @this {RegExpLexer}
             */
        constructLexErrorInfo: function lexer_constructLexErrorInfo(msg, recoverable, show_input_position) {
          msg = '' + msg;

          // heuristic to determine if the error message already contains a (partial) source code dump
          // as produced by either `showPosition()` or `prettyPrintRange()`:
          if (show_input_position == undefined) {
            show_input_position = !(msg.indexOf('\n') > 0 && msg.indexOf('^') > 0);
          }

          if (this.yylloc && show_input_position) {
            if (typeof this.prettyPrintRange === 'function') {
              var pretty_src = this.prettyPrintRange(this.yylloc);

              if (!/\n\s*$/.test(msg)) {
                msg += '\n';
              }

              msg += '\n  Erroneous area:\n' + this.prettyPrintRange(this.yylloc);
            } else if (typeof this.showPosition === 'function') {
              var pos_str = this.showPosition();

              if (pos_str) {
                if (msg.length && msg[msg.length - 1] !== '\n' && pos_str[0] !== '\n') {
                  msg += '\n' + pos_str;
                } else {
                  msg += pos_str;
                }
              }
            }
          }

          /** @constructor */
          var pei = {
            errStr: msg,
            recoverable: !!recoverable,

            // This one MAY be empty; userland code should use the `upcomingInput` API to obtain more text which follows the 'lexer cursor position'...
            text: this.match,

            token: null,
            line: this.yylineno,
            loc: this.yylloc,
            yy: this.yy,
            lexer: this,

            /**
                         * and make sure the error info doesn't stay due to potential
                         * ref cycle via userland code manipulations.
                         * These would otherwise all be memory leak opportunities!
                         * 
                         * Note that only array and object references are nuked as those
                         * constitute the set of elements which can produce a cyclic ref.
                         * The rest of the members is kept intact as they are harmless.
                         * 
                         * @public
                         * @this {LexErrorInfo}
                         */
            destroy: function destructLexErrorInfo() {
              // remove cyclic references added to error info:
              // info.yy = null;
              // info.lexer = null;
              // ...
              var rec = !!this.recoverable;

              for (var key in this) {
                if (this.hasOwnProperty(key) && typeof key === 'object') {
                  this[key] = undefined;
                }
              }

              this.recoverable = rec;
            }
          };

          // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
          this.__error_infos.push(pei);

          return pei;
        },

        /**
             * handler which is invoked when a lexer error occurs.
             * 
             * @public
             * @this {RegExpLexer}
             */
        parseError: function lexer_parseError(str, hash, ExceptionClass) {
          if (!ExceptionClass) {
            ExceptionClass = this.JisonLexerError;
          }

          if (this.yy) {
            if (this.yy.parser && typeof this.yy.parser.parseError === 'function') {
              return this.yy.parser.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            } else if (typeof this.yy.parseError === 'function') {
              return this.yy.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            }
          }

          throw new ExceptionClass(str, hash);
        },

        /**
             * method which implements `yyerror(str, ...args)` functionality for use inside lexer actions.
             * 
             * @public
             * @this {RegExpLexer}
             */
        yyerror: function yyError(str /*, ...args */) {
          var lineno_msg = '';

          if (this.yylloc) {
            lineno_msg = ' on line ' + (this.yylineno + 1);
          }

          var p = this.constructLexErrorInfo(
            'Lexical error' + lineno_msg + ': ' + str,
            this.options.lexerErrorsAreRecoverable
          );

          // Add any extra args to the hash under the name `extra_error_attributes`:
          var args = Array.prototype.slice.call(arguments, 1);

          if (args.length) {
            p.extra_error_attributes = args;
          }

          return this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
        },

        /**
             * final cleanup function for when we have completed lexing the input;
             * make it an API so that external code can use this one once userland
             * code has decided it's time to destroy any lingering lexer error
             * hash object instances and the like: this function helps to clean
             * up these constructs, which *may* carry cyclic references which would
             * otherwise prevent the instances from being properly and timely
             * garbage-collected, i.e. this function helps prevent memory leaks!
             * 
             * @public
             * @this {RegExpLexer}
             */
        cleanupAfterLex: function lexer_cleanupAfterLex(do_not_nuke_errorinfos) {
          // prevent lingering circular references from causing memory leaks:
          this.setInput('', {});

          // nuke the error hash info instances created during this run.
          // Userland code must COPY any data/references
          // in the error hash instance(s) it is more permanently interested in.
          if (!do_not_nuke_errorinfos) {
            for (var i = this.__error_infos.length - 1; i >= 0; i--) {
              var el = this.__error_infos[i];

              if (el && typeof el.destroy === 'function') {
                el.destroy();
              }
            }

            this.__error_infos.length = 0;
          }

          return this;
        },

        /**
             * clear the lexer token context; intended for internal use only
             * 
             * @public
             * @this {RegExpLexer}
             */
        clear: function lexer_clear() {
          this.yytext = '';
          this.yyleng = 0;
          this.match = '';

          // - DO NOT reset `this.matched`
          this.matches = false;

          this._more = false;
          this._backtrack = false;
          var col = this.yylloc ? this.yylloc.last_column : 0;

          this.yylloc = {
            first_line: this.yylineno + 1,
            first_column: col,
            last_line: this.yylineno + 1,
            last_column: col,
            range: [this.offset, this.offset]
          };
        },

        /**
             * resets the lexer, sets new input
             * 
             * @public
             * @this {RegExpLexer}
             */
        setInput: function lexer_setInput(input, yy) {
          this.yy = yy || this.yy || {};

          // also check if we've fully initialized the lexer instance,
          // including expansion work to be done to go from a loaded
          // lexer to a usable lexer:
          if (!this.__decompressed) {
            // step 1: decompress the regex list:
            var rules = this.rules;

            for (var i = 0, len = rules.length; i < len; i++) {
              var rule_re = rules[i];

              // compression: is the RE an xref to another RE slot in the rules[] table?
              if (typeof rule_re === 'number') {
                rules[i] = rules[rule_re];
              }
            }

            // step 2: unfold the conditions[] set to make these ready for use:
            var conditions = this.conditions;

            for (var k in conditions) {
              var spec = conditions[k];
              var rule_ids = spec.rules;
              var len = rule_ids.length;
              var rule_regexes = new Array(len + 1);            // slot 0 is unused; we use a 1-based index approach here to keep the hottest code in `lexer_next()` fast and simple!
              var rule_new_ids = new Array(len + 1);

              for (var i = 0; i < len; i++) {
                var idx = rule_ids[i];
                var rule_re = rules[idx];
                rule_regexes[i + 1] = rule_re;
                rule_new_ids[i + 1] = idx;
              }

              spec.rules = rule_new_ids;
              spec.__rule_regexes = rule_regexes;
              spec.__rule_count = len;
            }

            this.__decompressed = true;
          }

          this._input = input || '';
          this.clear();
          this._signaled_error_token = false;
          this.done = false;
          this.yylineno = 0;
          this.matched = '';
          this.conditionStack = ['INITIAL'];
          this.__currentRuleSet__ = null;

          this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
            range: [0, 0]
          };

          this.offset = 0;
          return this;
        },

        /**
             * edit the remaining input via user-specified callback.
             * This can be used to forward-adjust the input-to-parse, 
             * e.g. inserting macro expansions and alike in the
             * input which has yet to be lexed.
             * The behaviour of this API contrasts the `unput()` et al
             * APIs as those act on the *consumed* input, while this
             * one allows one to manipulate the future, without impacting
             * the current `yyloc` cursor location or any history. 
             * 
             * Use this API to help implement C-preprocessor-like
             * `#include` statements, etc.
             * 
             * The provided callback must be synchronous and is
             * expected to return the edited input (string).
             *
             * The `cpsArg` argument value is passed to the callback
             * as-is.
             *
             * `callback` interface: 
             * `function callback(input, cpsArg)`
             * 
             * - `input` will carry the remaining-input-to-lex string
             *   from the lexer.
             * - `cpsArg` is `cpsArg` passed into this API.
             * 
             * The `this` reference for the callback will be set to
             * reference this lexer instance so that userland code
             * in the callback can easily and quickly access any lexer
             * API. 
             *
             * When the callback returns a non-string-type falsey value,
             * we assume the callback did not edit the input and we
             * will using the input as-is.
             *
             * When the callback returns a non-string-type value, it
             * is converted to a string for lexing via the `"" + retval`
             * operation. (See also why: http://2ality.com/2012/03/converting-to-string.html 
             * -- that way any returned object's `toValue()` and `toString()`
             * methods will be invoked in a proper/desirable order.)
             * 
             * @public
             * @this {RegExpLexer}
             */
        editRemainingInput: function lexer_editRemainingInput(callback, cpsArg) {
          var rv = callback.call(this, this._input, cpsArg);

          if (typeof rv !== 'string') {
            if (rv) {
              this._input = '' + rv;
            }
            // else: keep `this._input` as is. 
          } else {
            this._input = rv;
          }

          return this;
        },

        /**
             * consumes and returns one char from the input
             * 
             * @public
             * @this {RegExpLexer}
             */
        input: function lexer_input() {
          if (!this._input) {
            //this.done = true;    -- don't set `done` as we want the lex()/next() API to be able to produce one custom EOF token match after this anyhow. (lexer can match special <<EOF>> tokens and perform user action code for a <<EOF>> match, but only does so *once*)
            return null;
          }

          var ch = this._input[0];
          this.yytext += ch;
          this.yyleng++;
          this.offset++;
          this.match += ch;
          this.matched += ch;

          // Count the linenumber up when we hit the LF (or a stand-alone CR).
          // On CRLF, the linenumber is incremented when you fetch the CR or the CRLF combo
          // and we advance immediately past the LF as well, returning both together as if
          // it was all a single 'character' only.
          var slice_len = 1;

          var lines = false;

          if (ch === '\n') {
            lines = true;
          } else if (ch === '\r') {
            lines = true;
            var ch2 = this._input[1];

            if (ch2 === '\n') {
              slice_len++;
              ch += ch2;
              this.yytext += ch2;
              this.yyleng++;
              this.offset++;
              this.match += ch2;
              this.matched += ch2;
              this.yylloc.range[1]++;
            }
          }

          if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
            this.yylloc.last_column = 0;
          } else {
            this.yylloc.last_column++;
          }

          this.yylloc.range[1]++;
          this._input = this._input.slice(slice_len);
          return ch;
        },

        /**
             * unshifts one char (or an entire string) into the input
             * 
             * @public
             * @this {RegExpLexer}
             */
        unput: function lexer_unput(ch) {
          var len = ch.length;
          var lines = ch.split(/(?:\r\n?|\n)/g);
          this._input = ch + this._input;
          this.yytext = this.yytext.substr(0, this.yytext.length - len);
          this.yyleng = this.yytext.length;
          this.offset -= len;
          this.match = this.match.substr(0, this.match.length - len);
          this.matched = this.matched.substr(0, this.matched.length - len);

          if (lines.length > 1) {
            this.yylineno -= lines.length - 1;
            this.yylloc.last_line = this.yylineno + 1;

            // Get last entirely matched line into the `pre_lines[]` array's
            // last index slot; we don't mind when other previously 
            // matched lines end up in the array too. 
            var pre = this.match;

            var pre_lines = pre.split(/(?:\r\n?|\n)/g);

            if (pre_lines.length === 1) {
              pre = this.matched;
              pre_lines = pre.split(/(?:\r\n?|\n)/g);
            }

            this.yylloc.last_column = pre_lines[pre_lines.length - 1].length;
          } else {
            this.yylloc.last_column -= len;
          }

          this.yylloc.range[1] = this.yylloc.range[0] + this.yyleng;
          this.done = false;
          return this;
        },

        /**
             * cache matched text and append it on next action
             * 
             * @public
             * @this {RegExpLexer}
             */
        more: function lexer_more() {
          this._more = true;
          return this;
        },

        /**
             * signal the lexer that this rule fails to match the input, so the
             * next matching rule (regex) should be tested instead.
             * 
             * @public
             * @this {RegExpLexer}
             */
        reject: function lexer_reject() {
          if (this.options.backtrack_lexer) {
            this._backtrack = true;
          } else {
            // when the `parseError()` call returns, we MUST ensure that the error is registered.
            // We accomplish this by signaling an 'error' token to be produced for the current
            // `.lex()` run.
            var lineno_msg = '';

            if (this.yylloc) {
              lineno_msg = ' on line ' + (this.yylineno + 1);
            }

            var p = this.constructLexErrorInfo(
              'Lexical error' + lineno_msg + ': You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).',
              false
            );

            this._signaled_error_token = this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
          }

          return this;
        },

        /**
             * retain first n characters of the match
             * 
             * @public
             * @this {RegExpLexer}
             */
        less: function lexer_less(n) {
          return this.unput(this.match.slice(n));
        },

        /**
             * return (part of the) already matched input, i.e. for error
             * messages.
             * 
             * Limit the returned string length to `maxSize` (default: 20).
             * 
             * Limit the returned string to the `maxLines` number of lines of
             * input (default: 1).
             * 
             * Negative limit values equal *unlimited*.
             * 
             * @public
             * @this {RegExpLexer}
             */
        pastInput: function lexer_pastInput(maxSize, maxLines) {
          var past = this.matched.substring(0, this.matched.length - this.match.length);

          if (maxSize < 0)
            maxSize = past.length;
          else if (!maxSize)
            maxSize = 20;

          if (maxLines < 0)
            maxLines = past.length;         // can't ever have more input lines than this!;
          else if (!maxLines)
            maxLines = 1;

          // `substr` anticipation: treat \r\n as a single character and take a little
          // more than necessary so that we can still properly check against maxSize
          // after we've transformed and limited the newLines in here:
          past = past.substr(-maxSize * 2 - 2);

          // now that we have a significantly reduced string to process, transform the newlines
          // and chop them, then limit them:
          var a = past.replace(/\r\n|\r/g, '\n').split('\n');

          a = a.slice(-maxLines);
          past = a.join('\n');

          // When, after limiting to maxLines, we still have too much to return,
          // do add an ellipsis prefix...
          if (past.length > maxSize) {
            past = '...' + past.substr(-maxSize);
          }

          return past;
        },

        /**
             * return (part of the) upcoming input, i.e. for error messages.
             * 
             * Limit the returned string length to `maxSize` (default: 20).
             * 
             * Limit the returned string to the `maxLines` number of lines of input (default: 1).
             * 
             * Negative limit values equal *unlimited*.
             *
             * > ### NOTE ###
             * >
             * > *"upcoming input"* is defined as the whole of the both
             * > the *currently lexed* input, together with any remaining input
             * > following that. *"currently lexed"* input is the input 
             * > already recognized by the lexer but not yet returned with
             * > the lexer token. This happens when you are invoking this API
             * > from inside any lexer rule action code block. 
             * >
             * 
             * @public
             * @this {RegExpLexer}
             */
        upcomingInput: function lexer_upcomingInput(maxSize, maxLines) {
          var next = this.match;

          if (maxSize < 0)
            maxSize = next.length + this._input.length;
          else if (!maxSize)
            maxSize = 20;

          if (maxLines < 0)
            maxLines = maxSize;         // can't ever have more input lines than this!;
          else if (!maxLines)
            maxLines = 1;

          // `substring` anticipation: treat \r\n as a single character and take a little
          // more than necessary so that we can still properly check against maxSize
          // after we've transformed and limited the newLines in here:
          if (next.length < maxSize * 2 + 2) {
            next += this._input.substring(0, maxSize * 2 + 2);  // substring is faster on Chrome/V8
          }

          // now that we have a significantly reduced string to process, transform the newlines
          // and chop them, then limit them:
          var a = next.replace(/\r\n|\r/g, '\n').split('\n');

          a = a.slice(0, maxLines);
          next = a.join('\n');

          // When, after limiting to maxLines, we still have too much to return,
          // do add an ellipsis postfix...
          if (next.length > maxSize) {
            next = next.substring(0, maxSize) + '...';
          }

          return next;
        },

        /**
             * return a string which displays the character position where the
             * lexing error occurred, i.e. for error messages
             * 
             * @public
             * @this {RegExpLexer}
             */
        showPosition: function lexer_showPosition(maxPrefix, maxPostfix) {
          var pre = this.pastInput(maxPrefix).replace(/\s/g, ' ');
          var c = new Array(pre.length + 1).join('-');
          return pre + this.upcomingInput(maxPostfix).replace(/\s/g, ' ') + '\n' + c + '^';
        },

        /**
             * return an YYLLOC info object derived off the given context (actual, preceding, following, current).
             * Use this method when the given `actual` location is not guaranteed to exist (i.e. when
             * it MAY be NULL) and you MUST have a valid location info object anyway:
             * then we take the given context of the `preceding` and `following` locations, IFF those are available,
             * and reconstruct the `actual` location info from those.
             * If this fails, the heuristic is to take the `current` location, IFF available.
             * If this fails as well, we assume the sought location is at/around the current lexer position
             * and then produce that one as a response. DO NOTE that these heuristic/derived location info
             * values MAY be inaccurate!
             *
             * NOTE: `deriveLocationInfo()` ALWAYS produces a location info object *copy* of `actual`, not just
             * a *reference* hence all input location objects can be assumed to be 'constant' (function has no side-effects).
             * 
             * @public
             * @this {RegExpLexer}
             */
        deriveLocationInfo: function lexer_deriveYYLLOC(actual, preceding, following, current) {
          var loc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,
            range: [0, 0]
          };

          if (actual) {
            loc.first_line = actual.first_line | 0;
            loc.last_line = actual.last_line | 0;
            loc.first_column = actual.first_column | 0;
            loc.last_column = actual.last_column | 0;

            if (actual.range) {
              loc.range[0] = actual.range[0] | 0;
              loc.range[1] = actual.range[1] | 0;
            }
          }

          if (loc.first_line <= 0 || loc.last_line < loc.first_line) {
            // plan B: heuristic using preceding and following:
            if (loc.first_line <= 0 && preceding) {
              loc.first_line = preceding.last_line | 0;
              loc.first_column = preceding.last_column | 0;

              if (preceding.range) {
                loc.range[0] = actual.range[1] | 0;
              }
            }

            if ((loc.last_line <= 0 || loc.last_line < loc.first_line) && following) {
              loc.last_line = following.first_line | 0;
              loc.last_column = following.first_column | 0;

              if (following.range) {
                loc.range[1] = actual.range[0] | 0;
              }
            }

            // plan C?: see if the 'current' location is useful/sane too:
            if (loc.first_line <= 0 && current && (loc.last_line <= 0 || current.last_line <= loc.last_line)) {
              loc.first_line = current.first_line | 0;
              loc.first_column = current.first_column | 0;

              if (current.range) {
                loc.range[0] = current.range[0] | 0;
              }
            }

            if (loc.last_line <= 0 && current && (loc.first_line <= 0 || current.first_line >= loc.first_line)) {
              loc.last_line = current.last_line | 0;
              loc.last_column = current.last_column | 0;

              if (current.range) {
                loc.range[1] = current.range[1] | 0;
              }
            }
          }

          // sanitize: fix last_line BEFORE we fix first_line as we use the 'raw' value of the latter
          // or plan D heuristics to produce a 'sensible' last_line value:
          if (loc.last_line <= 0) {
            if (loc.first_line <= 0) {
              loc.first_line = this.yylloc.first_line;
              loc.last_line = this.yylloc.last_line;
              loc.first_column = this.yylloc.first_column;
              loc.last_column = this.yylloc.last_column;
              loc.range[0] = this.yylloc.range[0];
              loc.range[1] = this.yylloc.range[1];
            } else {
              loc.last_line = this.yylloc.last_line;
              loc.last_column = this.yylloc.last_column;
              loc.range[1] = this.yylloc.range[1];
            }
          }

          if (loc.first_line <= 0) {
            loc.first_line = loc.last_line;
            loc.first_column = 0; // loc.last_column;
            loc.range[1] = loc.range[0];
          }

          if (loc.first_column < 0) {
            loc.first_column = 0;
          }

          if (loc.last_column < 0) {
            loc.last_column = loc.first_column > 0 ? loc.first_column : 80;
          }

          return loc;
        },

        /**
             * return a string which displays the lines & columns of input which are referenced 
             * by the given location info range, plus a few lines of context.
             * 
             * This function pretty-prints the indicated section of the input, with line numbers 
             * and everything!
             * 
             * This function is very useful to provide highly readable error reports, while
             * the location range may be specified in various flexible ways:
             * 
             * - `loc` is the location info object which references the area which should be
             *   displayed and 'marked up': these lines & columns of text are marked up by `^`
             *   characters below each character in the entire input range.
             * 
             * - `context_loc` is the *optional* location info object which instructs this
             *   pretty-printer how much *leading* context should be displayed alongside
             *   the area referenced by `loc`. This can help provide context for the displayed
             *   error, etc.
             * 
             *   When this location info is not provided, a default context of 3 lines is
             *   used.
             * 
             * - `context_loc2` is another *optional* location info object, which serves
             *   a similar purpose to `context_loc`: it specifies the amount of *trailing*
             *   context lines to display in the pretty-print output.
             * 
             *   When this location info is not provided, a default context of 1 line only is
             *   used.
             * 
             * Special Notes:
             * 
             * - when the `loc`-indicated range is very large (about 5 lines or more), then
             *   only the first and last few lines of this block are printed while a
             *   `...continued...` message will be printed between them.
             * 
             *   This serves the purpose of not printing a huge amount of text when the `loc`
             *   range happens to be huge: this way a manageable & readable output results
             *   for arbitrary large ranges.
             * 
             * - this function can display lines of input which whave not yet been lexed.
             *   `prettyPrintRange()` can access the entire input!
             * 
             * @public
             * @this {RegExpLexer}
             */
        prettyPrintRange: function lexer_prettyPrintRange(loc, context_loc, context_loc2) {
          loc = this.deriveLocationInfo(loc, context_loc, context_loc2);
          const CONTEXT = 3;
          const CONTEXT_TAIL = 1;
          const MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT = 2;
          var input = this.matched + this._input;
          var lines = input.split('\n');
          var l0 = Math.max(1, context_loc ? context_loc.first_line : loc.first_line - CONTEXT);
          var l1 = Math.max(1, context_loc2 ? context_loc2.last_line : loc.last_line + CONTEXT_TAIL);
          var lineno_display_width = 1 + Math.log10(l1 | 1) | 0;
          var ws_prefix = new Array(lineno_display_width).join(' ');
          var nonempty_line_indexes = [];

          var rv = lines.slice(l0 - 1, l1 + 1).map(function injectLineNumber(line, index) {
            var lno = index + l0;
            var lno_pfx = (ws_prefix + lno).substr(-lineno_display_width);
            var rv = lno_pfx + ': ' + line;
            var errpfx = new Array(lineno_display_width + 1).join('^');
            var offset = 2 + 1;
            var len = 0;

            if (lno === loc.first_line) {
              offset += loc.first_column;

              len = Math.max(
                2,
                (lno === loc.last_line ? loc.last_column : line.length) - loc.first_column + 1
              );
            } else if (lno === loc.last_line) {
              len = Math.max(2, loc.last_column + 1);
            } else if (lno > loc.first_line && lno < loc.last_line) {
              len = Math.max(2, line.length + 1);
            }

            if (len) {
              var lead = new Array(offset).join('.');
              var mark = new Array(len).join('^');
              rv += '\n' + errpfx + lead + mark;

              if (line.trim().length > 0) {
                nonempty_line_indexes.push(index);
              }
            }

            rv = rv.replace(/\t/g, ' ');
            return rv;
          });

          // now make sure we don't print an overly large amount of error area: limit it 
          // to the top and bottom line count:
          if (nonempty_line_indexes.length > 2 * MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT) {
            var clip_start = nonempty_line_indexes[MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT - 1] + 1;
            var clip_end = nonempty_line_indexes[nonempty_line_indexes.length - MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT] - 1;
            var intermediate_line = new Array(lineno_display_width + 1).join(' ') + '  (...continued...)';
            intermediate_line += '\n' + new Array(lineno_display_width + 1).join('-') + '  (---------------)';
            rv.splice(clip_start, clip_end - clip_start + 1, intermediate_line);
          }

          return rv.join('\n');
        },

        /**
             * helper function, used to produce a human readable description as a string, given
             * the input `yylloc` location object.
             * 
             * Set `display_range_too` to TRUE to include the string character index position(s)
             * in the description if the `yylloc.range` is available.
             * 
             * @public
             * @this {RegExpLexer}
             */
        describeYYLLOC: function lexer_describe_yylloc(yylloc, display_range_too) {
          var l1 = yylloc.first_line;
          var l2 = yylloc.last_line;
          var c1 = yylloc.first_column;
          var c2 = yylloc.last_column;
          var dl = l2 - l1;
          var dc = c2 - c1;
          var rv;

          if (dl === 0) {
            rv = 'line ' + l1 + ', ';

            if (dc <= 1) {
              rv += 'column ' + c1;
            } else {
              rv += 'columns ' + c1 + ' .. ' + c2;
            }
          } else {
            rv = 'lines ' + l1 + '(column ' + c1 + ') .. ' + l2 + '(column ' + c2 + ')';
          }

          if (yylloc.range && display_range_too) {
            var r1 = yylloc.range[0];
            var r2 = yylloc.range[1] - 1;

            if (r2 <= r1) {
              rv += ' {String Offset: ' + r1 + '}';
            } else {
              rv += ' {String Offset range: ' + r1 + ' .. ' + r2 + '}';
            }
          }

          return rv;
        },

        /**
             * test the lexed token: return FALSE when not a match, otherwise return token.
             * 
             * `match` is supposed to be an array coming out of a regex match, i.e. `match[0]`
             * contains the actually matched text string.
             * 
             * Also move the input cursor forward and update the match collectors:
             * 
             * - `yytext`
             * - `yyleng`
             * - `match`
             * - `matches`
             * - `yylloc`
             * - `offset`
             * 
             * @public
             * @this {RegExpLexer}
             */
        test_match: function lexer_test_match(match, indexed_rule) {
          var token, lines, backup, match_str, match_str_len;

          if (this.options.backtrack_lexer) {
            // save context
            backup = {
              yylineno: this.yylineno,

              yylloc: {
                first_line: this.yylloc.first_line,
                last_line: this.yylloc.last_line,
                first_column: this.yylloc.first_column,
                last_column: this.yylloc.last_column,
                range: this.yylloc.range.slice(0)
              },

              yytext: this.yytext,
              match: this.match,
              matches: this.matches,
              matched: this.matched,
              yyleng: this.yyleng,
              offset: this.offset,
              _more: this._more,
              _input: this._input,

              //_signaled_error_token: this._signaled_error_token,
              yy: this.yy,

              conditionStack: this.conditionStack.slice(0),
              done: this.done
            };
          }

          match_str = match[0];
          match_str_len = match_str.length;

          // if (match_str.indexOf('\n') !== -1 || match_str.indexOf('\r') !== -1) {
          lines = match_str.split(/(?:\r\n?|\n)/g);

          if (lines.length > 1) {
            this.yylineno += lines.length - 1;
            this.yylloc.last_line = this.yylineno + 1;
            this.yylloc.last_column = lines[lines.length - 1].length;
          } else {
            this.yylloc.last_column += match_str_len;
          }

          // }
          this.yytext += match_str;

          this.match += match_str;
          this.matched += match_str;
          this.matches = match;
          this.yyleng = this.yytext.length;
          this.yylloc.range[1] += match_str_len;

          // previous lex rules MAY have invoked the `more()` API rather than producing a token:
          // those rules will already have moved this `offset` forward matching their match lengths,
          // hence we must only add our own match length now:
          this.offset += match_str_len;

          this._more = false;
          this._backtrack = false;
          this._input = this._input.slice(match_str_len);

          // calling this method:
          //
          //   function lexer__performAction(yy, yyrulenumber, YY_START) {...}
          token = this.performAction.call(
            this,
            this.yy,
            indexed_rule,
            this.conditionStack[this.conditionStack.length - 1] /* = YY_START */
          );

          // otherwise, when the action codes are all simple return token statements:
          //token = this.simpleCaseActionClusters[indexed_rule];

          if (this.done && this._input) {
            this.done = false;
          }

          if (token) {
            return token;
          } else if (this._backtrack) {
            // recover context
            for (var k in backup) {
              this[k] = backup[k];
            }

            this.__currentRuleSet__ = null;
            return false; // rule action called reject() implying the next rule should be tested instead.
          } else if (this._signaled_error_token) {
            // produce one 'error' token as `.parseError()` in `reject()`
            // did not guarantee a failure signal by throwing an exception!
            token = this._signaled_error_token;

            this._signaled_error_token = false;
            return token;
          }

          return false;
        },

        /**
             * return next match in input
             * 
             * @public
             * @this {RegExpLexer}
             */
        next: function lexer_next() {
          if (this.done) {
            this.clear();
            return this.EOF;
          }

          if (!this._input) {
            this.done = true;
          }

          var token, match, tempMatch, index;

          if (!this._more) {
            this.clear();
          }

          var spec = this.__currentRuleSet__;

          if (!spec) {
            // Update the ruleset cache as we apparently encountered a state change or just started lexing.
            // The cache is set up for fast lookup -- we assume a lexer will switch states much less often than it will
            // invoke the `lex()` token-producing API and related APIs, hence caching the set for direct access helps
            // speed up those activities a tiny bit.
            spec = this.__currentRuleSet__ = this._currentRules();

            // Check whether a *sane* condition has been pushed before: this makes the lexer robust against
            // user-programmer bugs such as https://github.com/zaach/jison-lex/issues/19
            if (!spec || !spec.rules) {
              var lineno_msg = '';

              if (this.options.trackPosition) {
                lineno_msg = ' on line ' + (this.yylineno + 1);
              }

              var p = this.constructLexErrorInfo(
                'Internal lexer engine error' + lineno_msg + ': The lex grammar programmer pushed a non-existing condition name "' + this.topState() + '"; this is a fatal error and should be reported to the application programmer team!',
                false
              );

              // produce one 'error' token until this situation has been resolved, most probably by parse termination!
              return this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;
            }
          }

          var rule_ids = spec.rules;
          var regexes = spec.__rule_regexes;
          var len = spec.__rule_count;

          // Note: the arrays are 1-based, while `len` itself is a valid index,
          // hence the non-standard less-or-equal check in the next loop condition!
          for (var i = 1; i <= len; i++) {
            tempMatch = this._input.match(regexes[i]);

            if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
              match = tempMatch;
              index = i;

              if (this.options.backtrack_lexer) {
                token = this.test_match(tempMatch, rule_ids[i]);

                if (token !== false) {
                  return token;
                } else if (this._backtrack) {
                  match = undefined;
                  continue; // rule action called reject() implying a rule MISmatch.
                } else {
                  // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                  return false;
                }
              } else if (!this.options.flex) {
                break;
              }
            }
          }

          if (match) {
            token = this.test_match(match, rule_ids[index]);

            if (token !== false) {
              return token;
            }

            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
            return false;
          }

          if (!this._input) {
            this.done = true;
            this.clear();
            return this.EOF;
          } else {
            var lineno_msg = '';

            if (this.options.trackPosition) {
              lineno_msg = ' on line ' + (this.yylineno + 1);
            }

            var p = this.constructLexErrorInfo(
              'Lexical error' + lineno_msg + ': Unrecognized text.',
              this.options.lexerErrorsAreRecoverable
            );

            var pendingInput = this._input;
            var activeCondition = this.topState();
            var conditionStackDepth = this.conditionStack.length;
            token = this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR;

            if (token === this.ERROR) {
              // we can try to recover from a lexer error that `parseError()` did not 'recover' for us
              // by moving forward at least one character at a time IFF the (user-specified?) `parseError()`
              // has not consumed/modified any pending input or changed state in the error handler:
              if (!this.matches && // and make sure the input has been modified/consumed ...
              pendingInput === this._input && // ...or the lexer state has been modified significantly enough
              // to merit a non-consuming error handling action right now.
              activeCondition === this.topState() && conditionStackDepth === this.conditionStack.length) {
                this.input();
              }
            }

            return token;
          }
        },

        /**
             * return next match that has a token
             * 
             * @public
             * @this {RegExpLexer}
             */
        lex: function lexer_lex() {
          var r;

          // allow the PRE/POST handlers set/modify the return token for maximum flexibility of the generated lexer:
          if (typeof this.pre_lex === 'function') {
            r = this.pre_lex.call(this, 0);
          }

          if (typeof this.options.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.pre_lex.call(this, r) || r;
          }

          if (this.yy && typeof this.yy.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.pre_lex.call(this, r) || r;
          }

          while (!r) {
            r = this.next();
          }

          if (this.yy && typeof this.yy.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.post_lex.call(this, r) || r;
          }

          if (typeof this.options.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.post_lex.call(this, r) || r;
          }

          if (typeof this.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.post_lex.call(this, r) || r;
          }

          return r;
        },

        /**
             * return next match that has a token. Identical to the `lex()` API but does not invoke any of the 
             * `pre_lex()` nor any of the `post_lex()` callbacks.
             * 
             * @public
             * @this {RegExpLexer}
             */
        fastLex: function lexer_fastLex() {
          var r;

          while (!r) {
            r = this.next();
          }

          return r;
        },

        /**
             * return info about the lexer state that can help a parser or other lexer API user to use the
             * most efficient means available. This API is provided to aid run-time performance for larger
             * systems which employ this lexer.
             * 
             * @public
             * @this {RegExpLexer}
             */
        canIUse: function lexer_canIUse() {
          var rv = {
            fastLex: !(typeof this.pre_lex === 'function' || typeof this.options.pre_lex === 'function' || this.yy && typeof this.yy.pre_lex === 'function' || this.yy && typeof this.yy.post_lex === 'function' || typeof this.options.post_lex === 'function' || typeof this.post_lex === 'function') && typeof this.fastLex === 'function'
          };

          return rv;
        },

        /**
             * backwards compatible alias for `pushState()`;
             * the latter is symmetrical with `popState()` and we advise to use
             * those APIs in any modern lexer code, rather than `begin()`.
             * 
             * @public
             * @this {RegExpLexer}
             */
        begin: function lexer_begin(condition) {
          return this.pushState(condition);
        },

        /**
             * activates a new lexer condition state (pushes the new lexer
             * condition state onto the condition stack)
             * 
             * @public
             * @this {RegExpLexer}
             */
        pushState: function lexer_pushState(condition) {
          this.conditionStack.push(condition);
          this.__currentRuleSet__ = null;
          return this;
        },

        /**
             * pop the previously active lexer condition state off the condition
             * stack
             * 
             * @public
             * @this {RegExpLexer}
             */
        popState: function lexer_popState() {
          var n = this.conditionStack.length - 1;

          if (n > 0) {
            this.__currentRuleSet__ = null;
            return this.conditionStack.pop();
          } else {
            return this.conditionStack[0];
          }
        },

        /**
             * return the currently active lexer condition state; when an index
             * argument is provided it produces the N-th previous condition state,
             * if available
             * 
             * @public
             * @this {RegExpLexer}
             */
        topState: function lexer_topState(n) {
          n = this.conditionStack.length - 1 - Math.abs(n || 0);

          if (n >= 0) {
            return this.conditionStack[n];
          } else {
            return 'INITIAL';
          }
        },

        /**
             * (internal) determine the lexer rule set which is active for the
             * currently active lexer condition state
             * 
             * @public
             * @this {RegExpLexer}
             */
        _currentRules: function lexer__currentRules() {
          if (this.conditionStack.length && this.conditionStack[this.conditionStack.length - 1]) {
            return this.conditions[this.conditionStack[this.conditionStack.length - 1]];
          } else {
            return this.conditions['INITIAL'];
          }
        },

        /**
             * return the number of states currently on the stack
             * 
             * @public
             * @this {RegExpLexer}
             */
        stateStackSize: function lexer_stateStackSize() {
          return this.conditionStack.length;
        },

        options: {
          xregexp: true,
          ranges: true,
          trackPosition: true,
          easy_keyword_rules: true
        },

        JisonLexerError: JisonLexerError,

        performAction: function lexer__performAction(yy, yyrulenumber, YY_START) {
          var yy_ = this;

          switch (yyrulenumber) {
          case 0:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %\{ */
            yy.depth = 0;

            yy.include_command_allowed = false;
            this.pushState('action');
            this.unput(yy_.yytext);
            yy_.yytext = '';
            return 28;
          case 1:
            /*! Conditions:: action */
            /*! Rule::       %\{([^]*?)%\} */
            yy_.yytext = this.matches[1].replace(/%\\\}/g, '%}');   // unescape any literal '%\}' that exists within the action code block

            yy.include_command_allowed = true;
            return 32;
          case 2:
            /*! Conditions:: action */
            /*! Rule::       %include\b */
            if (yy.include_command_allowed) {
              // This is an include instruction in place of an action:
              //
              // - one %include per action chunk
              // - one %include replaces an entire action chunk
              this.pushState('path');

              return 51;
            } else {
              // TODO
              yy_.yyerror(rmCommonWS`
                                                    %include statements must occur on a line on their own and cannot occur inside an %{...%} action code block.
                                                    Its use is not permitted at this position.

                                                      Erroneous area:
                                                    ` + this.prettyPrintRange(yy_.yylloc));

              return 37;
            }
          case 3:
            /*! Conditions:: action */
            /*! Rule::       {WS}*\/\*[^]*?\*\/ */
            //yy.include_command_allowed = false; -- doesn't impact include-allowed state
            return 34;
          case 4:
            /*! Conditions:: action */
            /*! Rule::       {WS}*\/\/.* */
            yy.include_command_allowed = false;

            return 35;
          case 6:
            /*! Conditions:: action */
            /*! Rule::       \| */
            if (yy.include_command_allowed) {
              this.popState();
              this.unput(yy_.yytext);
              yy_.yytext = '';
              return 31;
            } else {
              return 33;
            }
          case 7:
            /*! Conditions:: action */
            /*! Rule::       %% */
            if (yy.include_command_allowed) {
              this.popState();
              this.unput(yy_.yytext);
              yy_.yytext = '';
              return 31;
            } else {
              return 33;
            }
          case 9:
            /*! Conditions:: action */
            /*! Rule::       \/[^\s/]*?(?:['"`{}][^\s/]*?)*\/ */
            yy.include_command_allowed = false;

            return 33;
          case 10:
            /*! Conditions:: action */
            /*! Rule::       \/[^}{BR}]* */
            yy.include_command_allowed = false;

            return 33;
          case 11:
            /*! Conditions:: action */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy.include_command_allowed = false;

            return 33;
          case 12:
            /*! Conditions:: action */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy.include_command_allowed = false;

            return 33;
          case 13:
            /*! Conditions:: action */
            /*! Rule::       `{ES2017_STRING_CONTENT}` */
            yy.include_command_allowed = false;

            return 33;
          case 14:
            /*! Conditions:: action */
            /*! Rule::       [^{}/"'`|%\{\}{BR}{WS}]+ */
            yy.include_command_allowed = false;

            return 33;
          case 15:
            /*! Conditions:: action */
            /*! Rule::       \{ */
            yy.depth++;

            yy.include_command_allowed = false;
            return 33;
          case 16:
            /*! Conditions:: action */
            /*! Rule::       \} */
            yy.include_command_allowed = false;

            if (yy.depth <= 0) {
              yy_.yyerror(rmCommonWS`
                                                    too many closing curly braces in lexer rule action block.

                                                    Note: the action code chunk may be too complex for jison to parse
                                                    easily; we suggest you wrap the action code chunk in '%{...%}'
                                                    to help jison grok more or less complex action code chunks.

                                                      Erroneous area:
                                                    ` + this.prettyPrintRange(yy_.yylloc));

              return 30;
            } else {
              yy.depth--;
            }

            return 33;
          case 17:
            /*! Conditions:: action */
            /*! Rule::       (?:{BR}{WS}+)+(?=[^{WS}{BR}|]) */
            yy.include_command_allowed = true;

            return 36;           // keep empty lines as-is inside action code blocks. 
          case 18:
            /*! Conditions:: action */
            /*! Rule::       {BR} */
            if (yy.depth > 0) {
              yy.include_command_allowed = true;
              return 36;       // keep empty lines as-is inside action code blocks.
            } else {
              // end of action code chunk
              this.popState();

              this.unput(yy_.yytext);
              yy_.yytext = '';
              return 31;
            }
          case 19:
            /*! Conditions:: action */
            /*! Rule::       $ */
            yy.include_command_allowed = false;

            if (yy.depth !== 0) {
              yy_.yyerror(rmCommonWS`
                                                    missing ${yy.depth} closing curly braces in lexer rule action block.

                                                    Note: the action code chunk may be too complex for jison to parse
                                                    easily; we suggest you wrap the action code chunk in '%{...%}'
                                                    to help jison grok more or less complex action code chunks.

                                                      Erroneous area:
                                                    ` + this.prettyPrintRange(yy_.yylloc));

              yy_.yytext = '';
              return 29;
            }

            this.popState();
            yy_.yytext = '';
            return 31;
          case 21:
            /*! Conditions:: conditions */
            /*! Rule::       > */
            this.popState();

            return 6;
          case 24:
            /*! Conditions:: INITIAL start_condition macro path options */
            /*! Rule::       {WS}*\/\/[^\r\n]* */
            /* skip single-line comment */
            break;
          case 25:
            /*! Conditions:: INITIAL start_condition macro path options */
            /*! Rule::       {WS}*\/\*[^]*?\*\/ */
            /* skip multi-line comment */
            break;
          case 26:
            /*! Conditions:: rules */
            /*! Rule::       {BR}+ */
            /* empty */
            break;
          case 27:
            /*! Conditions:: rules */
            /*! Rule::       {WS}+{BR}+ */
            /* empty */
            break;
          case 28:
            /*! Conditions:: rules */
            /*! Rule::       \/\/[^\r\n]* */
            /* skip single-line comment */
            break;
          case 29:
            /*! Conditions:: rules */
            /*! Rule::       \/\*[^]*?\*\/ */
            /* skip multi-line comment */
            break;
          case 30:
            /*! Conditions:: rules */
            /*! Rule::       {WS}+(?=[^{WS}{BR}|%]) */
            yy.depth = 0;

            yy.include_command_allowed = true;
            this.pushState('action');
            return 28;
          case 31:
            /*! Conditions:: rules */
            /*! Rule::       %% */
            this.popState();

            this.pushState('code');
            return 19;
          case 32:
            /*! Conditions:: rules */
            /*! Rule::       {ANY_LITERAL_CHAR}+ */
            // accept any non-regex, non-lex, non-string-delim,
            // non-escape-starter, non-space character as-is
            return 46;
          case 35:
            /*! Conditions:: options */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy_.yytext = unescQuote(this.matches[1]);

            return 49;   // value is always a string type 
          case 36:
            /*! Conditions:: options */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy_.yytext = unescQuote(this.matches[1]);

            return 49;   // value is always a string type 
          case 37:
            /*! Conditions:: options */
            /*! Rule::       `{ES2017_STRING_CONTENT}` */
            yy_.yytext = unescQuote(this.matches[1]);

            return 49;   // value is always a string type 
          case 39:
            /*! Conditions:: options */
            /*! Rule::       {BR}{WS}+(?=\S) */
            /* skip leading whitespace on the next line of input, when followed by more options */
            break;
          case 40:
            /*! Conditions:: options */
            /*! Rule::       {BR} */
            this.popState();

            return 48;
          case 41:
            /*! Conditions:: options */
            /*! Rule::       {WS}+ */
            /* skip whitespace */
            break;
          case 43:
            /*! Conditions:: start_condition */
            /*! Rule::       {BR}+ */
            this.popState();

            break;
          case 44:
            /*! Conditions:: start_condition */
            /*! Rule::       {WS}+ */
            /* empty */
            break;
          case 46:
            /*! Conditions:: INITIAL */
            /*! Rule::       {ID} */
            this.pushState('macro');

            return 20;
          case 47:
            /*! Conditions:: macro named_chunk */
            /*! Rule::       {BR}+ */
            this.popState();

            break;
          case 48:
            /*! Conditions:: macro */
            /*! Rule::       {ANY_LITERAL_CHAR}+ */
            // accept any non-regex, non-lex, non-string-delim,
            // non-escape-starter, non-space character as-is
            return 46;
          case 49:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       {BR}+ */
            /* empty */
            break;
          case 50:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       \s+ */
            /* empty */
            break;
          case 51:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy_.yytext = unescQuote(this.matches[1]);

            return 26;
          case 52:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy_.yytext = unescQuote(this.matches[1]);

            return 26;
          case 53:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       \[ */
            this.pushState('set');

            return 41;
          case 66:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       < */
            this.pushState('conditions');

            return 5;
          case 67:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       \/! */
            return 39;                    // treated as `(?!atom)` 
          case 68:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       \/ */
            return 14;                     // treated as `(?=atom)` 
          case 70:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       \\. */
            yy_.yytext = yy_.yytext.replace(/^\\/g, '');

            return 44;
          case 73:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %option[s]? */
            this.pushState('options');

            return 47;
          case 74:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %s\b */
            this.pushState('start_condition');

            return 21;
          case 75:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %x\b */
            this.pushState('start_condition');

            return 22;
          case 76:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %code\b */
            this.pushState('named_chunk');

            return 25;
          case 77:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %import\b */
            this.pushState('named_chunk');

            return 24;
          case 78:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %include\b */
            yy.depth = 0;

            yy.include_command_allowed = true;
            this.pushState('action');
            this.unput(yy_.yytext);
            yy_.yytext = '';
            return 28;
          case 79:
            /*! Conditions:: code */
            /*! Rule::       %include\b */
            this.pushState('path');

            return 51;
          case 80:
            /*! Conditions:: INITIAL rules code */
            /*! Rule::       %{NAME}([^\r\n]*) */
            /* ignore unrecognized decl */
            this.warn(rmCommonWS`
                                                LEX: ignoring unsupported lexer option ${dquote(yy_.yytext)}
                                                while lexing in ${dquote(this.topState())} state.

                                                  Erroneous area:
                                                ` + this.prettyPrintRange(yy_.yylloc));

            yy_.yytext = {
              // {NAME}
              name: this.matches[1],

              // optional value/parameters
              value: this.matches[2].trim()
            };

            return 23;
          case 81:
            /*! Conditions:: rules macro named_chunk INITIAL */
            /*! Rule::       %% */
            this.pushState('rules');

            return 19;
          case 89:
            /*! Conditions:: set */
            /*! Rule::       \] */
            this.popState();

            return 42;
          case 91:
            /*! Conditions:: code */
            /*! Rule::       [^\r\n]+ */
            return 53;      // the bit of CODE just before EOF... 
          case 92:
            /*! Conditions:: path */
            /*! Rule::       {BR} */
            this.popState();

            this.unput(yy_.yytext);
            break;
          case 93:
            /*! Conditions:: path */
            /*! Rule::       "{DOUBLEQUOTED_STRING_CONTENT}" */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 52;
          case 94:
            /*! Conditions:: path */
            /*! Rule::       '{QUOTED_STRING_CONTENT}' */
            yy_.yytext = unescQuote(this.matches[1]);

            this.popState();
            return 52;
          case 95:
            /*! Conditions:: path */
            /*! Rule::       {WS}+ */
            // skip whitespace in the line 
            break;
          case 96:
            /*! Conditions:: path */
            /*! Rule::       [^\s\r\n]+ */
            this.popState();

            return 52;
          case 97:
            /*! Conditions:: action */
            /*! Rule::       " */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 98:
            /*! Conditions:: action */
            /*! Rule::       ' */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 99:
            /*! Conditions:: action */
            /*! Rule::       ` */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 100:
            /*! Conditions:: options */
            /*! Rule::       " */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 101:
            /*! Conditions:: options */
            /*! Rule::       ' */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 102:
            /*! Conditions:: options */
            /*! Rule::       ` */
            yy_.yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 103:
            /*! Conditions:: * */
            /*! Rule::       " */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                            unterminated string constant  encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 104:
            /*! Conditions:: * */
            /*! Rule::       ' */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                            unterminated string constant  encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 105:
            /*! Conditions:: * */
            /*! Rule::       ` */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                            unterminated string constant  encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ` + this.prettyPrintRange(yy_.yylloc));

            return 2;
          case 106:
            /*! Conditions:: macro rules */
            /*! Rule::       . */
            /* b0rk on bad characters */
            var rules = this.topState() === 'macro' ? 'macro\'s' : this.topState();

            yy_.yyerror(rmCommonWS`
                                                unsupported lexer input encountered while lexing
                                                ${rules} (i.e. jison lex regexes).

                                                    NOTE: When you want this input to be interpreted as a LITERAL part
                                                          of a lex rule regex, you MUST enclose it in double or
                                                          single quotes.

                                                          If not, then know that this input is not accepted as a valid
                                                          regex expression here in jison-lex ${rules}.

                                                  Erroneous area:
                                                ` + this.prettyPrintRange(yy_.yylloc));

            break;
          case 107:
            /*! Conditions:: * */
            /*! Rule::       . */
            yy_.yyerror(rmCommonWS`
                                                unsupported lexer input: ${dquote(yy_.yytext)}
                                                while lexing in ${dquote(this.topState())} state.

                                                  Erroneous area:
                                                ` + this.prettyPrintRange(yy_.yylloc));

            break;
          default:
            return this.simpleCaseActionClusters[yyrulenumber];
          }
        },

        simpleCaseActionClusters: {
          /*! Conditions:: action */
          /*! Rule::       {WS}+ */
          5: 36,

          /*! Conditions:: action */
          /*! Rule::       % */
          8: 33,

          /*! Conditions:: conditions */
          /*! Rule::       {NAME} */
          20: 20,

          /*! Conditions:: conditions */
          /*! Rule::       , */
          22: 8,

          /*! Conditions:: conditions */
          /*! Rule::       \* */
          23: 7,

          /*! Conditions:: options */
          /*! Rule::       {NAME} */
          33: 20,

          /*! Conditions:: options */
          /*! Rule::       = */
          34: 18,

          /*! Conditions:: options */
          /*! Rule::       [^\s\r\n]+ */
          38: 50,

          /*! Conditions:: start_condition */
          /*! Rule::       {ID} */
          42: 27,

          /*! Conditions:: named_chunk */
          /*! Rule::       {ID} */
          45: 20,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \| */
          54: 9,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \(\?: */
          55: 38,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \(\?= */
          56: 38,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \(\?! */
          57: 38,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \( */
          58: 10,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \) */
          59: 11,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \+ */
          60: 12,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \* */
          61: 7,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \? */
          62: 13,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \^ */
          63: 16,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       , */
          64: 8,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       <<EOF>> */
          65: 17,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \\([0-7]{1,3}|[rfntvsSbBwWdD\\*+()${}|[\]\/.^?]|c[A-Z]|x[0-9A-F]{2}|u[a-fA-F0-9]{4}) */
          69: 44,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \$ */
          71: 17,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \. */
          72: 15,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \{\d+(,\s*\d+|,)?\} */
          82: 45,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \{{ID}\} */
          83: 40,

          /*! Conditions:: set options */
          /*! Rule::       \{{ID}\} */
          84: 40,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \{ */
          85: 3,

          /*! Conditions:: rules macro named_chunk INITIAL */
          /*! Rule::       \} */
          86: 4,

          /*! Conditions:: set */
          /*! Rule::       (?:\\\\|\\\]|[^\]{])+ */
          87: 43,

          /*! Conditions:: set */
          /*! Rule::       \{ */
          88: 43,

          /*! Conditions:: code */
          /*! Rule::       [^\r\n]*(\r|\n)+ */
          90: 53,

          /*! Conditions:: * */
          /*! Rule::       $ */
          108: 1
        },

        rules: [
          /*   0: */  /^(?:%\{)/,
          /*   1: */  /^(?:%\{([\s\S]*?)%\})/,
          /*   2: */  /^(?:%include\b)/,
          /*   3: */  /^(?:([^\S\n\r])*\/\*[\s\S]*?\*\/)/,
          /*   4: */  /^(?:([^\S\n\r])*\/\/.*)/,
          /*   5: */  /^(?:([^\S\n\r])+)/,
          /*   6: */  /^(?:\|)/,
          /*   7: */  /^(?:%%)/,
          /*   8: */  /^(?:%)/,
          /*   9: */  /^(?:\/[^\s/]*?(?:['"`{}][^\s/]*?)*\/)/,
          /*  10: */  /^(?:\/[^\n\r}]*)/,
          /*  11: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /*  12: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /*  13: */  /^(?:`((?:\\`|\\[^`]|[^\\`])*)`)/,
          /*  14: */  /^(?:[^\s"%'/`{-}]+)/,
          /*  15: */  /^(?:\{)/,
          /*  16: */  /^(?:\})/,
          /*  17: */  /^(?:(?:(\r\n|\n|\r)([^\S\n\r])+)+(?=[^\s|]))/,
          /*  18: */  /^(?:(\r\n|\n|\r))/,
          /*  19: */  /^(?:$)/,
          /*  20: */  new XRegExp__default['default'](
            '^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}\\-_]*(?:[\\p{Alphabetic}\\p{Number}_]))?))',
            ''
          ),
          /*  21: */  /^(?:>)/,
          /*  22: */  /^(?:,)/,
          /*  23: */  /^(?:\*)/,
          /*  24: */  /^(?:([^\S\n\r])*\/\/[^\n\r]*)/,
          /*  25: */  /^(?:([^\S\n\r])*\/\*[\s\S]*?\*\/)/,
          /*  26: */  /^(?:(\r\n|\n|\r)+)/,
          /*  27: */  /^(?:([^\S\n\r])+(\r\n|\n|\r)+)/,
          /*  28: */  /^(?:\/\/[^\r\n]*)/,
          /*  29: */  /^(?:\/\*[\s\S]*?\*\/)/,
          /*  30: */  /^(?:([^\S\n\r])+(?=[^\s%|]))/,
          /*  31: */  /^(?:%%)/,
          /*  32: */  /^(?:([^\s!"$%'-,./:-?\[-\^{-}])+)/,
          /*  33: */  new XRegExp__default['default'](
            '^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}\\-_]*(?:[\\p{Alphabetic}\\p{Number}_]))?))',
            ''
          ),
          /*  34: */  /^(?:=)/,
          /*  35: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /*  36: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /*  37: */  /^(?:`((?:\\`|\\[^`]|[^\\`])*)`)/,
          /*  38: */  /^(?:\S+)/,
          /*  39: */  /^(?:(\r\n|\n|\r)([^\S\n\r])+(?=\S))/,
          /*  40: */  /^(?:(\r\n|\n|\r))/,
          /*  41: */  /^(?:([^\S\n\r])+)/,
          /*  42: */  new XRegExp__default['default']('^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*))', ''),
          /*  43: */  /^(?:(\r\n|\n|\r)+)/,
          /*  44: */  /^(?:([^\S\n\r])+)/,
          /*  45: */  new XRegExp__default['default']('^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*))', ''),
          /*  46: */  new XRegExp__default['default']('^(?:([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*))', ''),
          /*  47: */  /^(?:(\r\n|\n|\r)+)/,
          /*  48: */  /^(?:([^\s!"$%'-,./:-?\[-\^{-}])+)/,
          /*  49: */  /^(?:(\r\n|\n|\r)+)/,
          /*  50: */  /^(?:\s+)/,
          /*  51: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /*  52: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /*  53: */  /^(?:\[)/,
          /*  54: */  /^(?:\|)/,
          /*  55: */  /^(?:\(\?:)/,
          /*  56: */  /^(?:\(\?=)/,
          /*  57: */  /^(?:\(\?!)/,
          /*  58: */  /^(?:\()/,
          /*  59: */  /^(?:\))/,
          /*  60: */  /^(?:\+)/,
          /*  61: */  /^(?:\*)/,
          /*  62: */  /^(?:\?)/,
          /*  63: */  /^(?:\^)/,
          /*  64: */  /^(?:,)/,
          /*  65: */  /^(?:<<EOF>>)/,
          /*  66: */  /^(?:<)/,
          /*  67: */  /^(?:\/!)/,
          /*  68: */  /^(?:\/)/,
          /*  69: */  /^(?:\\([0-7]{1,3}|[$(-+./?BDSW\[-\^bdfnr-tvw{-}]|c[A-Z]|x[\dA-F]{2}|u[\dA-Fa-f]{4}))/,
          /*  70: */  /^(?:\\.)/,
          /*  71: */  /^(?:\$)/,
          /*  72: */  /^(?:\.)/,
          /*  73: */  /^(?:%option[s]?)/,
          /*  74: */  /^(?:%s\b)/,
          /*  75: */  /^(?:%x\b)/,
          /*  76: */  /^(?:%code\b)/,
          /*  77: */  /^(?:%import\b)/,
          /*  78: */  /^(?:%include\b)/,
          /*  79: */  /^(?:%include\b)/,
          /*  80: */  new XRegExp__default['default'](
            '^(?:%([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}\\-_]*(?:[\\p{Alphabetic}\\p{Number}_]))?)([^\\n\\r]*))',
            ''
          ),
          /*  81: */  /^(?:%%)/,
          /*  82: */  /^(?:\{\d+(,\s*\d+|,)?\})/,
          /*  83: */  new XRegExp__default['default']('^(?:\\{([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*)\\})', ''),
          /*  84: */  new XRegExp__default['default']('^(?:\\{([\\p{Alphabetic}_](?:[\\p{Alphabetic}\\p{Number}_])*)\\})', ''),
          /*  85: */  /^(?:\{)/,
          /*  86: */  /^(?:\})/,
          /*  87: */  /^(?:(?:\\\\|\\\]|[^\]{])+)/,
          /*  88: */  /^(?:\{)/,
          /*  89: */  /^(?:\])/,
          /*  90: */  /^(?:[^\r\n]*(\r|\n)+)/,
          /*  91: */  /^(?:[^\r\n]+)/,
          /*  92: */  /^(?:(\r\n|\n|\r))/,
          /*  93: */  /^(?:"((?:\\"|\\[^"]|[^\n\r"\\])*)")/,
          /*  94: */  /^(?:'((?:\\'|\\[^']|[^\n\r'\\])*)')/,
          /*  95: */  /^(?:([^\S\n\r])+)/,
          /*  96: */  /^(?:\S+)/,
          /*  97: */  /^(?:")/,
          /*  98: */  /^(?:')/,
          /*  99: */  /^(?:`)/,
          /* 100: */  /^(?:")/,
          /* 101: */  /^(?:')/,
          /* 102: */  /^(?:`)/,
          /* 103: */  /^(?:")/,
          /* 104: */  /^(?:')/,
          /* 105: */  /^(?:`)/,
          /* 106: */  /^(?:.)/,
          /* 107: */  /^(?:.)/,
          /* 108: */  /^(?:$)/
        ],

        conditions: {
          'rules': {
            rules: [
              0,
              26,
              27,
              28,
              29,
              30,
              31,
              32,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              74,
              75,
              76,
              77,
              78,
              80,
              81,
              82,
              83,
              85,
              86,
              103,
              104,
              105,
              106,
              107,
              108
            ],

            inclusive: true
          },

          'macro': {
            rules: [
              0,
              24,
              25,
              47,
              48,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              74,
              75,
              76,
              77,
              78,
              81,
              82,
              83,
              85,
              86,
              103,
              104,
              105,
              106,
              107,
              108
            ],

            inclusive: true
          },

          'named_chunk': {
            rules: [
              0,
              45,
              47,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              74,
              75,
              76,
              77,
              78,
              81,
              82,
              83,
              85,
              86,
              103,
              104,
              105,
              107,
              108
            ],

            inclusive: true
          },

          'code': {
            rules: [79, 80, 90, 91, 103, 104, 105, 107, 108],
            inclusive: false
          },

          'start_condition': {
            rules: [24, 25, 42, 43, 44, 103, 104, 105, 107, 108],
            inclusive: false
          },

          'options': {
            rules: [
              24,
              25,
              33,
              34,
              35,
              36,
              37,
              38,
              39,
              40,
              41,
              84,
              100,
              101,
              102,
              103,
              104,
              105,
              107,
              108
            ],

            inclusive: false
          },

          'conditions': {
            rules: [20, 21, 22, 23, 103, 104, 105, 107, 108],
            inclusive: false
          },

          'action': {
            rules: [
              1,
              2,
              3,
              4,
              5,
              6,
              7,
              8,
              9,
              10,
              11,
              12,
              13,
              14,
              15,
              16,
              17,
              18,
              19,
              97,
              98,
              99,
              103,
              104,
              105,
              107,
              108
            ],

            inclusive: false
          },

          'path': {
            rules: [24, 25, 92, 93, 94, 95, 96, 103, 104, 105, 107, 108],
            inclusive: false
          },

          'set': {
            rules: [84, 87, 88, 89, 103, 104, 105, 107, 108],
            inclusive: false
          },

          'INITIAL': {
            rules: [
              0,
              24,
              25,
              46,
              49,
              50,
              51,
              52,
              53,
              54,
              55,
              56,
              57,
              58,
              59,
              60,
              61,
              62,
              63,
              64,
              65,
              66,
              67,
              68,
              69,
              70,
              71,
              72,
              73,
              74,
              75,
              76,
              77,
              78,
              80,
              81,
              82,
              83,
              85,
              86,
              103,
              104,
              105,
              107,
              108
            ],

            inclusive: true
          }
        }
      };

      var rmCommonWS = helpers.rmCommonWS;
      var dquote = helpers.dquote;

      // unescape a string value which is wrapped in quotes/doublequotes
      function unescQuote(str) {
        str = '' + str;
        var a = str.split('\\\\');

        a = a.map(function(s) {
          return s.replace(/\\'/g, '\'').replace(/\\"/g, '"');
        });

        str = a.join('\\\\');
        return str;
      }

      lexer.warn = function l_warn() {
        if (this.yy && this.yy.parser && typeof this.yy.parser.warn === 'function') {
          return this.yy.parser.warn.apply(this, arguments);
        } else {
          console.warn.apply(console, arguments);
        }
      };

      lexer.log = function l_log() {
        if (this.yy && this.yy.parser && typeof this.yy.parser.log === 'function') {
          return this.yy.parser.log.apply(this, arguments);
        } else {
          console.log.apply(console, arguments);
        }
      };

      return lexer;
    }();
    parser$3.lexer = lexer$2;

    var rmCommonWS$2 = helpers.rmCommonWS;
    var checkActionBlock$2 = helpers.checkActionBlock;


    function encodeRE(s) {
        return s.replace(/([.*+?^${}()|\[\]\/\\])/g, '\\$1').replace(/\\\\u([a-fA-F0-9]{4})/g, '\\u$1');
    }

    function prepareString(s) {
        // unescape slashes
        s = s.replace(/\\\\/g, "\\");
        s = encodeRE(s);
        return s;
    }

    // convert string value to number or boolean value, when possible
    // (and when this is more or less obviously the intent)
    // otherwise produce the string itself as value.
    function parseValue$1(v) {
        if (v === 'false') {
            return false;
        }
        if (v === 'true') {
            return true;
        }
        // http://stackoverflow.com/questions/175739/is-there-a-built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
        // Note that the `v` check ensures that we do not convert `undefined`, `null` and `''` (empty string!)
        if (v && !isNaN(v)) {
            var rv = +v;
            if (isFinite(rv)) {
                return rv;
            }
        }
        return v;
    }


    parser$3.warn = function p_warn() {
        console.warn.apply(console, arguments);
    };

    parser$3.log = function p_log() {
        console.log.apply(console, arguments);
    };

    parser$3.pre_parse = function p_lex() {
        if (parser$3.yydebug) parser$3.log('pre_parse:', arguments);
    };

    parser$3.yy.pre_parse = function p_lex() {
        if (parser$3.yydebug) parser$3.log('pre_parse YY:', arguments);
    };

    parser$3.yy.post_lex = function p_lex() {
        if (parser$3.yydebug) parser$3.log('post_lex:', arguments);
    };


    function Parser$2() {
        this.yy = {};
    }
    Parser$2.prototype = parser$3;
    parser$3.Parser = Parser$2;

    function yyparse$2() {
        return parser$3.parse.apply(parser$3, arguments);
    }



    var jisonlex = {
        parser: parser$3,
        Parser: Parser$2,
        parse: yyparse$2,
        
    };

    var version = '0.6.2-220';                              // require('./package.json').version;

    function parse(grammar) {
        return bnf.parser.parse(grammar);
    }

    // adds a declaration to the grammar
    bnf.parser.yy.addDeclaration = function bnfAddDeclaration(grammar, decl) {
        if (!decl) {
            return;
        }

        if (decl.start) {
            grammar.start = decl.start;
        }
        if (decl.lex) {
            grammar.lex = parseLex(decl.lex.text, decl.lex.position);
        }
        if (decl.grammar) {
            grammar.grammar = decl.grammar;
        }
        if (decl.ebnf) {
            grammar.ebnf = decl.ebnf;
        }
        if (decl.bnf) {
            grammar.bnf = decl.bnf;
        }
        if (decl.operator) {
            if (!grammar.operators) grammar.operators = [];
            grammar.operators.push(decl.operator);
        }
        if (decl.token) {
            if (!grammar.extra_tokens) grammar.extra_tokens = [];
            grammar.extra_tokens.push(decl.token);
        }
        if (decl.token_list) {
            if (!grammar.extra_tokens) grammar.extra_tokens = [];
            decl.token_list.forEach(function (tok) {
                grammar.extra_tokens.push(tok);
            });
        }
        if (decl.parseParams) {
            if (!grammar.parseParams) grammar.parseParams = [];
            grammar.parseParams = grammar.parseParams.concat(decl.parseParams);
        }
        if (decl.parserType) {
            if (!grammar.options) grammar.options = {};
            grammar.options.type = decl.parserType;
        }
        if (decl.include) {
            if (!grammar.moduleInclude) {
                grammar.moduleInclude = decl.include;
            } else {
                grammar.moduleInclude += '\n\n' + decl.include;
            }
        }
        if (decl.actionInclude) {
            if (!grammar.actionInclude) {
                grammar.actionInclude = decl.actionInclude;
            } else {
                grammar.actionInclude += '\n\n' + decl.actionInclude;
            }
        }
        if (decl.options) {
            if (!grammar.options) grammar.options = {};
            // last occurrence of `%options` wins:
            for (var i = 0; i < decl.options.length; i++) {
                grammar.options[decl.options[i][0]] = decl.options[i][1];
            }
        }
        if (decl.unknownDecl) {
            if (!grammar.unknownDecls) grammar.unknownDecls = [];         // [ array of {name,value} pairs ]
            grammar.unknownDecls.push(decl.unknownDecl);
        }
        if (decl.imports) {
            if (!grammar.imports) grammar.imports = [];                   // [ array of {name,path} pairs ]
            grammar.imports.push(decl.imports);
        }
        if (decl.initCode) {
            if (!grammar.moduleInit) {
                grammar.moduleInit = [];
            }
            grammar.moduleInit.push(decl.initCode);       // {qualifier: <name>, include: <source code chunk>}
        }
        if (decl.codeSection) {
            if (!grammar.moduleInit) {
                grammar.moduleInit = [];
            }
            grammar.moduleInit.push(decl.codeSection);                    // {qualifier: <name>, include: <source code chunk>}
        }
        if (decl.onErrorRecovery) {
            if (!grammar.errorRecoveryActions) {
                grammar.errorRecoveryActions = [];
            }
            grammar.errorRecoveryActions.push(decl.onErrorRecovery);      // {qualifier: <name>, include: <source code chunk>}
        }
    };

    // parse an embedded lex section
    function parseLex(text, position) {
        text = text.replace(/(?:^%lex)|(?:\/lex$)/g, '');
        // We want the lex input to start at the given 'position', if any,
        // so that error reports will produce a line number and character index
        // which matches the original input file:
        position = position || {};
        position.range = position.range || [];
        var l = position.first_line | 0;
        var c = position.range[0] | 0;
        var prelude = '';
        if (l > 1) {
            prelude += (new Array(l)).join('\n');
            c -= prelude.length;
        }
        if (c > 3) {
            prelude = '// ' + (new Array(c - 3)).join('.') + prelude;
        }
        return jisonlex.parse(prelude + text);
    }

    const ebnf_parser = {
        transform
    };

    var ebnfParser = {
        parse,

        transform,

        // assistant exports for debugging/testing:
        bnf_parser: bnf,
        ebnf_parser,
        bnf_lexer: jisonlex,

        version,
    };

    return ebnfParser;

})));
