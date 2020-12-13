const assert = require('chai').assert;
const Jison = require('../setup').Jison;
const Lexer = require('../setup').Lexer;
const helpers = require('../../packages/helpers-lib');

const fs = require('fs');
const path = require('path');


function exec(src, line, forceDump) {
    return helpers.exec_and_diagnose_this_stuff(src, function code_execution_rig(sourcecode, options, errname, debug) {
        if (forceDump) helpers.dumpSourceToFile(sourcecode, errname);
        const f = new Function(sourcecode);
        return f();
    }, {
        dumpSourceCodeOnFailure: true,
        throwErrorOnCompileFailure: true
    }, line);
}


describe('Parser Generator API', function () {
    it('test amd module generator', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            tokens: 'x y',
            startSymbol: 'A',
            bnf: {
                A :[ 'A x',
                    'A y',
                    ''      ]
            }
        };

        let input = 'xyxxxy';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateAMDModule();
        let parser = exec(`
            let parser;

            let define = function (deps, callback) {
                // temporary AMD-style define function, for testing.
                if (!callback) {
                    // no deps array:
                    parser = deps();
                } else {
                    parser = callback();
                }
            };

            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 63");

        assert.ok(parser.parse(input));
    });

    it('test commonjs module generator', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            tokens: 'x y',
            startSymbol: 'A',
            bnf: {
                A :[ 'A x',
                    'A y',
                    ''      ]
            }
        };

        let input = 'xyxxxy';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateCommonJSModule();
        let exp = exec(`
            // fake it to ensure the checks in the generated code fire:
            if (typeof exports === "undefined") {
                var exports = {};
            }
            if (typeof require === "undefined") {
                var require = () => { throw new Error("require has been shimmed") };
            }

            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            console.error("exports = ", exports);
            return exports;
        `, "Line 105");

        assert.ok(exp.parse(input));
    });

    it('test module generator', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            tokens: 'x y',
            startSymbol: 'A',
            bnf: {
                A :[ 'A x',
                    'A y',
                    ''      ]
            }
        };

        let input = 'xyxxxy';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateModule();
        let parser = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 138");

        assert.ok(parser.parse(input));
    });

    it('test module generator with module name', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            tokens: 'x y',
            startSymbol: 'A',
            bnf: {
                A :[ 'A x',
                    'A y',
                    ''      ]
            }
        };

        let input = 'xyxxxy';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generate({ moduleType: 'js', moduleName: 'parsey' });
        let parsey = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parsey;
        `, "Line 171");

        assert.ok(parsey.parse(input));
    });

    it('test module generator with namespaced module name', function () {
        let lexData = {
            rules: [
                [ 'x', "return 'x';" ],
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            tokens: 'x y',
            startSymbol: 'A',
            bnf: {
                A :[ 'A x',
                    'A y',
                    ''      ]
            }
        };

        let input = 'xyxxxy';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateModule({ moduleName: 'compiler.parser' });
        let compiler = exec(`
            let compiler = {};

            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return compiler;
        `, "Line 206");

        assert.ok(compiler.parser.parse(input));
    });

    it('test module include', function () {
        let grammar = {
            comment: 'ECMA-262 5th Edition, 15.12.1 The JSON Grammar. (Incomplete implementation)',
            author: 'Zach Carter',

            lex: {
                macros: {
                    digit: '[0-9]',
                    exp: '([eE][-+]?{digit}+)'
                },
                rules: [
                    [ '\\s+', '/* skip whitespace */' ],
                    [ '-?{digit}+(\\.{digit}+)?{exp}?', "return 'NUMBER';" ],
                    [ '"[^"]*',
                        /* istanbul ignore next: code is injected and then crashes the generated parser due to unreachable coverage global */
                        function () {
                            if (yytext.charAt(yyleng - 1) == '\\') {
                                // remove escape
                                yytext = yytext.substr(0, yyleng - 2);
                                this.more();
                            } else {
                                yytext = yytext.substr(1); // swallow start quote
                                this.input(); // swallow end quote
                                return 'STRING';
                            }
                        }
                    ],
                    [ '\\{', "return '{'" ],
                    [ '\\}', "return '}'" ],
                    [ '\\[', "return '['" ],
                    [ '\\]', "return ']'" ],
                    [ ',', "return ','" ],
                    [ ':', "return ':'" ],
                    [ 'true\\b', "return 'TRUE'" ],
                    [ 'false\\b', "return 'FALSE'" ],
                    [ 'null\\b', "return 'NULL'" ]
                ]
            },

            tokens: 'STRING NUMBER { } [ ] , : TRUE FALSE NULL',
            start: 'JSONText',

            bnf: {
                JSONString: [ 'STRING' ],

                JSONNumber: [ 'NUMBER' ],

                JSONBooleanLiteral: [ 'TRUE', 'FALSE' ],


                JSONText: [ 'JSONValue' ],

                JSONValue: [ 'JSONNullLiteral',
                    'JSONBooleanLiteral',
                    'JSONString',
                    'JSONNumber',
                    'JSONObject',
                    'JSONArray' ],

                JSONObject: [ '{ }',
                    '{ JSONMemberList }' ],

                JSONMember: [ 'JSONString : JSONValue' ],

                JSONMemberList: [ 'JSONMember',
                    'JSONMemberList , JSONMember' ],

                JSONArray: [ '[ ]',
                    '[ JSONElementList ]' ],

                JSONElementList: [ 'JSONValue',
                    'JSONElementList , JSONValue' ]
            }
        };

        let gen = new Jison.Generator(grammar);

        let parserSource = gen.generateModule();
        let parser = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 295");

        assert.ok(parser.parse(JSON.stringify(grammar.bnf)));
    });

    it('test module include code', function () {
        let lexData = {
            rules: [
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            bnf: {
                E   :[ [ 'E y', 'return test();' ],
                    '' ]
            },
            moduleInclude: 'function test(val) { return 1; }'
        };

        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateCommonJSModule();
        let parser = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 324");

        assert.equal(parser.parse('y'), 1, 'semantic action');
    });

    it('test lexer module include code', function () {
        let lexData = {
            rules: [
                [ 'y', 'return test();' ]
            ],
            moduleInclude: 'function test() { return 1; }'
        };
        let grammar = {
            bnf: {
                E   :[ [ 'E y', 'return $2;' ],
                    '' ]
            }
        };

        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateCommonJSModule();
        let parser = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 353");

        assert.equal(parser.parse('y'), 1, 'semantic action');
    });

    it('test generated parser instance creation', function () {
        let grammar = {
            lex: {
                rules: [
                    [ 'y', "return 'y'" ]
                ]
            },
            bnf: {
                E   :[ [ 'E y', 'return $2;' ],
                    '' ]
            }
        };

        let gen = new Jison.Generator(grammar);

        let parserSource = gen.generateModule();
        let parser = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 380");

        let p = new parser.Parser();

        assert.equal(p.parse('y'), 'y', 'semantic action');

        parser.blah = true;

        assert.notEqual(parser.blah, p.blah, "shouldn't inherit props");
    });

    it('test module include code using generator from parser', function () {
        let lexData = {
            rules: [
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            bnf: {
                E   :[ [ 'E y', 'return test();' ],
                    '' ]
            },
            moduleInclude: 'function test(val) { return 1; }'
        };

        let gen = new Jison.Parser(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateCommonJSModule();
        let parser = exec(`
            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 415");

        assert.equal(parser.parse('y'), 1, 'semantic action');
    });

    it('test module include with each generator type', function () {
        let lexData = {
            rules: [
                [ 'y', "return 'y';" ]
            ]
        };
        let grammar = {
            bnf: {
                E   :[ [ 'E y', 'return test();' ],
                    '' ]
            },
            moduleInclude: 'var TEST_VAR;'
        };

        let gen = new Jison.Parser(grammar);
        gen.lexer = new Lexer(lexData);
        [ 'generateModule', 'generateAMDModule', 'generateCommonJSModule' ]
        .map(function (type) {
            let source = gen[type]();
            assert.ok(/TEST_VAR/.test(source), type + ' supports module include');
        });
    });

// test for issue #246
    it('test compiling a parser/lexer', function () {
        let grammar =
            '// Simple "happy happy joy joy" parser, written by Nolan Lawson\n' +
            '// Based on the song of the same name.\n\n' +
            '%lex\n%%\n\n\\s+                   /* skip whitespace */\n' +
            '("happy")             return \'happy\'\n' +
            '("joy")               return \'joy\'\n' +
            '<<EOF>>               return \'EOF\'\n\n' +
            '/lex\n\n%start expressions\n\n' +
            '%ebnf\n\n%%\n\n' +
            'expressions\n    : e EOF\n        {return $1;}\n    ;\n\n' +
            'e\n    : phrase+ \'joy\'? -> $1 + \' \' + yytext \n    ;\n\n' +
            'phrase\n    : \'happy\' \'happy\' \'joy\' \'joy\' ' +
            ' -> [$1, $2, $3, $4].join(\' \') \n    ;';

        let parser = new Jison.Parser(grammar);
        let generated = parser.generate();

        let tmpFile = path.resolve(__dirname, 'tmp-parser.js');
        fs.writeFileSync(tmpFile, generated);
        let parser2 = require('./tmp-parser');

        assert.ok(parser.parse('happy happy joy joy joy') === 'happy happy joy joy joy',
            'original parser works');
        assert.ok(parser2.parse('happy happy joy joy joy') === 'happy happy joy joy joy',
            'generated parser works');
        fs.unlinkSync(tmpFile);
    });

    it("test 'comment token' edge case which could break the parser generator", function () {
        let lexData = {
            rules: [
                [ '\\*\\/', "return '*/';" ],
                [ "'*/'", "return '*/';" ]
            ]
        };
        let grammar = {
            startSymbol: 'A',
            bnf: {
                A :[ [ 'A \'*/\'', '$$ = 1;' ],
                    [ '', '$$ = 0;' ] ]
            }
        };

        let input = '*/*/*/';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateAMDModule();
        let parser = exec(`
            let parser;

            let define = function (deps, callback) {
                // temporary AMD-style define function, for testing.
                if (!callback) {
                    // no deps array:
                    parser = deps();
                } else {
                    parser = callback();
                }
            };

            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 511");

        assert.ok(parser.parse(input));
    });

    it("test 'semantic whitespace' edge case which could break the parser generator", function () {
        let lexData = {
            rules: [
                [ '\\ ', "return ' ';" ],
                [ "' '", "return ' ';" ],
                [ 'x', "yytext = 7; return 'x';" ]
            ]
        };
        let grammar = {
            startSymbol: 'G',
            // a literal whitespace in the rules could potentially damage the generated output as the
            // productions are re-assembled into strings before being ferried off to `buildProductions()`,
            // which would then call `string.split(' ')` on them before we introduced the new
            // `splitStringIntoSymbols()` splitter in there.
            //
            // Of course it's rather odd to have rules parsed, then reassembled and then, in a sense,
            // parsed *again*, but alas, that's how it is. Probably done this way to have automatic
            // JSON input support alongside the JISON feed which I (GerHobbelt) normally use.
            //
            // Anyway, this grammar is crafted as a minimum sample which can potentially break the parser
            // and is included in these tests to prevent nasty regressions: when things go pear-shaped
            // you won't notice much, apart from maybe, after pulling all your hair, that the
            // generated `$N` references are off by at least one(1).
            //
            // Pumping this through the EBNF parser also can help to break things around there;
            // **TODO** is pumping this in various incantations through both raw BNF and EBNF
            // parsers to see who will falter, today.
            ebnf: {
                G :[ [ 'A', 'return $A;' ] ],
                A :[ [ 'A ( \' \' )+ x', '$$ = $1 + $x + $2.join(\' \').length;' ],
                    [ '', '$$ = 0;' ] ]
            }
        };

        let input = ' x  x x x x';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateAMDModule();
        let parser = exec(`
            let parser;

            let define = function (deps, callback) {
                // temporary AMD-style define function, for testing.
                if (!callback) {
                    // no deps array:
                    parser = deps();
                } else {
                    parser = callback();
                }
            };

            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 573");

        let rv = parser.parse(input);
        assert.equal(rv, 42);
    });

    // same as previous test, only now all single quotes are swapped for double quotes:
    it("test quotes around 'semantic whitespace'", function () {
        let lexData = {
            rules: [
                [ '\\ ', "return ' ';" ],
                [ '" "', "return ' ';" ],
                [ 'x', "yytext = 7; return 'x';" ]
            ]
        };
        let grammar = {
            startSymbol: 'G',
            ebnf: {
                G :[ [ 'A', 'return $A;' ] ],
                A :[ [ 'A ( " " )+ x', '$$ = $1 + $x + $2.join(" ").length;' ],
                    [ '', '$$ = 0;' ] ]
            }
        };

        let input = ' x  x x x x';
        let gen = new Jison.Generator(grammar);
        gen.lexer = new Lexer(lexData);

        let parserSource = gen.generateAMDModule();
        let parser = exec(`
            let parser;

            let define = function (deps, callback) {
                // temporary AMD-style define function, for testing.
                if (!callback) {
                    // no deps array:
                    parser = deps();
                } else {
                    parser = callback();
                }
            };

            // =================== GENERATED SOURCECODE START ====================
            ${parserSource}
            // =================== GENERATED SOURCECODE END ====================

            return parser;
        `, "Line 620");

        let rv = parser.parse(input);
        assert.equal(rv, 42);
    });

    // test `%import symbols` functionality
    it('test %import statement', function () {
        let grammar =
            '%lex\n%%\n\n\\s+      /* skip whitespace */\n' +
            'x                     return \'x\';\n' +
            '<<EOF>>               return \'EOF\'\n\n' +
            '/lex\n\n%start expressions\n\n' +
            '%import bugger boo\n\n' +
            '%import "kwik kwak" "diddle doo"\n\n%%\n\n' +
            'expressions\n    : e EOF\n        {return $1;}\n    ;\n\n' +
            'e\n    : x -> $1\n    ;';

        let gen = new Jison.Generator(grammar);
        //console.log('generator: ', gen.grammar.imports);
        assert.ok(gen.grammar.imports.length === 2, '%imports detected');
        assert.ok(gen.grammar.imports[0].name === 'bugger', '%import name works');
        assert.ok(gen.grammar.imports[0].path === 'boo', '%import path works');
        assert.ok(gen.grammar.imports[1].name === 'kwik kwak', '%import name works');
        assert.ok(gen.grammar.imports[1].path === 'diddle doo', '%import path works');

        let parser = new Jison.Parser(grammar);
        let generated = parser.generate();

        let tmpFile = path.resolve(__dirname, 'tmp-imports-parser.js');
        fs.writeFileSync(tmpFile, generated);
        let parser2 = require('./tmp-imports-parser');

        assert.ok(parser.parse('x') === 'x',
            'original parser works');
        assert.ok(parser2.parse('x') === 'x',
            'generated parser works');
        fs.unlinkSync(tmpFile);
    });

    // test advanced `%import symbols` functionality
    it('test %import statement in second grammar picks up symbols from first grammar', function () {
        let grammar =
            '%lex\n%%\n\n\\s+      /* skip whitespace */\n' +
            'yy                     return \'y\';\n' +
            'xx                     return \'x\';\n' +
            '<<EOF>>               return \'EOF\'\n\n' +
            '/lex\n\n%start expressions\n\n' +
            '%%\n\n' +
            'expressions\n    : e EOF\n        {return $1;}\n    ;\n\n' +
            'e\n    : x y -> $x + $y\n    ;';

        let parser = new Jison.Parser(grammar);
        let generated = parser.generate();

        let tmpFile = path.resolve(__dirname, 'tmp-imports-parser2.js');
        fs.writeFileSync(tmpFile, generated);

        let grammar2 =
            '%lex\n%%\n\n\\s+      /* skip whitespace */\n' +
            'xx                     return \'x\';\n' +
            '<<EOF>>               return \'EOF\'\n\n' +
            '/lex\n\n%start expressions\n\n' +
            '%import symbols "' + __dirname + '/tmp-imports-parser2.js"\n\n' +
            '%%\n\n' +
            'expressions\n    : e EOF\n        {return $1;}\n    ;\n\n' +
            'e\n    : x -> $1\n    ;';

        let parser2 = new Jison.Parser(grammar2);
        let generated2 = parser2.generate();

        let tmpFile2 = path.resolve(__dirname, 'tmp-imports-parser3.js');
        fs.writeFileSync(tmpFile2, generated2);

        // both files should carry the exact same symbol table:
        let re = /[\r\n]\s*symbols_:\s*(\{[\s\S]*?\}),\s*[\r\n]/;
        let m1 = re.exec(generated);
        let m2 = re.exec(generated2);

        assert.ok(m1[1] === m2[1], 'both grammars\' symbol tables match');

        fs.unlinkSync(tmpFile);
        fs.unlinkSync(tmpFile2);
    });
});

