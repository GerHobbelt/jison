const assert = require('chai').assert;
const Jison = require('../setup').Jison;
const Lexer = require('../setup').Lexer;
const fs = require('fs');
const path = require('path');
const yaml = require('@gerhobbelt/js-yaml');
const JSON5 = require('@gerhobbelt/json5');
const globby = require('globby');
const helpers = require('../../packages/helpers-lib');
const trimErrorForTestReporting = helpers.trimErrorForTestReporting;
const stripErrorStackPaths = helpers.stripErrorStackPaths;
const cleanStackTrace4Comparison = helpers.cleanStackTrace4Comparison;
const rmCommonWS = helpers.rmCommonWS;
const mkdirp = helpers.mkdirp;
const code_exec = helpers.exec_and_diagnose_this_stuff;


const lexData = {
    rules: [
        [ 'x', 'return "x";' ],
        [ 'y', 'return "y";' ]
    ]
};




const test_list = [
    {
        name: 'issue-289',
        __ignore__: true
    },
    {
        name: 'issue-lex-23',
        inputs: [
            '1 + 2 + 3 + 4 + 5\n'
        ],
        parseResult: 15
    },
    {
        name: 'error-handling-and-yyclearin',
        inputs: [
            'A\nB A\nA\nA\n'
        ]
    },
    {
        name: 'error-handling-and-yyerrok-macro',
        inputs: [
            'A\nB A\nA\nA\n'
        ]
    },
    {
        name: 'error-handling-and-yyerrok-part3',
        inputs: [
            '    zz ;'      +
            '    ( zz ) ;'  +
            '    ( zz ;'    +
            '    zz ;'      +
            '    zz ;'      +
            '    zz );'     +
            '    zz ;'
        ]
    },
    {
        name: 'error-recognition-actions',
        inputs: [
            'A\nB A\nA\nA\n'
        ]
    },
    {
        name: 'no-prec-hack-needed',
        __ignore__: true
    },
    {
        name: 'yacc-error-recovery',
        __ignore__: true
    },
    {
        name: 'with_custom_lexer',
        __ignore__: true
    },
    {
        name: 'parser-to-lexer-communication-test--profiling',
        type: 'lr'
    },
    {
        name: 'parser-to-lexer-communication-test',
        type: 'lr',
        __ignore__: true
    },
    {
        name: 'faking-multiple-start-rules',
        __ignore__: true
    },
    {
        name: 'faking-multiple-start-rules-alt',
        __ignore__: true
    },
    {
        name: 'lalr-but-not-slr',
        type: 'lalr'
    },
    {
        name: 'lr-but-not-lalr',
        type: 'lr'
    },
    {
        name: 'test-propagation-rules-reduction-1',
        reportStats: true,
        exportAllTables: true,
        __check__: function (p, spec, rv, tables) {
            assert.equal(p.unused_productions.length, 0, 'grammar must report it found 0 unused rules');
            assert.equal(tables.parseTable.length, 7, 'grammar must report it has 7 states in the parse table');
            assert.equal(Object.keys(tables.defaultParseActions).length, 5, 'grammar must report it has 7 default action rows in the parse table');
            assert.equal(tables.parseProductions.length, 5, 'grammar must report it has 5 productions');
        }
    },
    {
        name: 'test-propagation-rules-reduction-2',
        reportStats: true,
        exportAllTables: true,
        __check__: function (p, spec, rv, tables) {
            assert.equal(p.unused_productions.length, 4, 'grammar must report it found 4 unused rules');
            assert.equal(tables.parseTable.length, 3, 'grammar must report it has 3 states in the parse table');
            assert.equal(Object.keys(tables.defaultParseActions).length, 1, 'grammar must report it has 1 default action rows in the parse table');
            assert.equal(tables.parseProductions.length, 5, 'grammar must report it has 5 productions');
        }
    },
    {
        name: 'test-unused-rules-reporting',
        reportStats: true,
        __check__: function (p, spec) {
            assert.equal(p.unused_productions.length, 3, 'grammar must report it found 3 unused rules');
        }
    },
    {
        name: 'test-unused-rules-reporting-alt',
        reportStats: true,
        __check__: function (p, spec) {
            assert.equal(p.unused_productions.length, 3, 'grammar must report it found 3 unused rules');
        }
    },
    {
        name: 'compound-include-path-must-be-in-quotes',
        fail: true
    }
];















console.log('exec glob....', __dirname);
const original_cwd = process.cwd();
process.chdir(__dirname);
let testset = globby.sync([
  '../../examples/*.jison',
  '../../examples/issue-lex-*.js',
]);

testset = testset.sort();

const testsetSpec = helpers.setupFileBasedTestRig(__dirname, testset, 'jison-gho', { useGeneratorRef: false });









//
// compile these grammars and run a sample input through them
//
describe('Example/Test Grammars', function () {
    testsetSpec.filespecList.forEach(function (filespec) {
        // process this file:
        let title = (filespec.meta ? filespec.meta.title : null);

        let testname = 'test: ' + filespec.filepath4display + (title ? ' :: ' + title : '');

        console.error('generate test: ', testname);

        // and create a test for it:
        it(testname, function testEachParserExampleA() {
            let err, ast;
            let i = 0;
            let tokens = [];
            let lexer = bnf.bnf_parser.parser.lexer;

            let grammar = filespec.grammar;









// TODO TODO TODO TODO  CLEANUP!





            try {
                // Change CWD to the directory where the source grammar resides: this helps us properly
                // %include any files mentioned in the grammar with relative paths:
                process.chdir(path.dirname(filespec.path));





                let options = {
                    json: true
                };
                for (let k in filespec) {
                    if (k !== 'path' && k !== 'inputs' && k !== '__check__' && k !== 'exportAllTables') {
                        options[k] = filespec[k];
                    }
                    if (k === 'exportAllTables') {
                        options.exportAllTables = {};
                    }
                }
                //options.exportSourceCode = {};
                options.file = filespec.path;
                let parser = new Jison.Parser(grammar, options);
                let rv;

                // and change back to the CWD we started out with:
                process.chdir(original_cwd);

                if (filespec.__ignore__) {
                    return;
                }

                code_exec(String(parser.parse), function test_exec() {
                    let expected_rv = (filespec.parseResult !== undefined ? filespec.parseResult : true);

                    if (typeof parser.main === 'function') {
                        assert.ok(!parser.main(), 'main() is supposed to produce zero ~ success');
                    } else if (filespec.inputs) {
                        for (let i = 0, l = filespec.inputs.length; i < l; i++) {
                            rv = parser.parse(filespec.inputs[i]);
                            console.log('parse A: ', filespec.inputs[i], rv);
                            assert.strictEqual(rv, expected_rv, 'parser.parse() is supposed to produce TRUE');
                        }
                    } else {
                        rv = parser.parse('zz; yy; zz;zz ;');
                        console.log('parse B: ', path.basename(filespec.path), rv);
                        assert.strictEqual(rv, expected_rv, 'parser.parse() is supposed to produce TRUE');
                    }
                }, {
                    dumpSourceCodeOnFailure: true,
                    throwErrorOnCompileFailure: true,
                    inputFilename: parser.options.inputFilename,
                    inputPath: parser.options.inputPath
                }, 'test');

                if (filespec.__check__) {
                    filespec.__check__(parser, filespec, rv, options.exportAllTables);
                }


















            } catch (ex) {
                countFATALs++;
                
                // save the error:
                err = ex;
                tokens.push({
                    id: -1,
                    token: null,
                    fail: 1,
                    meta: filespec.spec.meta,
                    err: ex
                });
                // and make sure ast !== undefined:
                if (!ast) {
                    ast = { fail: 1 };
                }
            } finally {
                process.chdir(original_cwd);
            }

            // write a summary node at the end of the stream:
            tokens.push({
                id: -2,
                token: null,
                summary: {
                    totalTokenCount: tokens.length,
                    EOFTokenCount: countEOFs,
                    ERRORTokenCount: countERRORs,
                    ParseErrorCallCount: countParseErrorCalls,
                    DetectedParseErrorCallCount: countDetectedParseErrorCalls,
                    fatalExceptionCount: countFATALs
                }
            });
            // if (lexerSourceCode) {
            //   tokens.push(lexerSourceCode);
            // }
            tokens = testsetSpec.trimErrorForTestReporting(tokens);

            // either we check/test the correctness of the collected input, iff there's
            // a reference provided, OR we create the reference file for future use:
            let refOut = JSON5.stringify(tokens, {
                replacer: function remove_lexer_objrefs(key, value) {
                    if (value === lexer) {
                        return '[lexer instance]';
                    }
                    return value;
                },
                space: 2,
                circularRefHandler: testsetSpec.testrig_JSON5circularRefHandler
            });

            // strip away devbox-specific paths in error stack traces in the output:
            refOut = testsetSpec.stripErrorStackPaths(refOut);

            refOut = rmCommonWS`
                /* 
                 * grammar spec generated by @gerhobbelt/ebnf-parser for input file:
                 *     ${filespec.filepath4display}
                 */

            `.trimStart() + refOut;

            if (filespec.ref) {
                // Perform the validations only AFTER we've written the files to output:
                // several tests produce very large outputs, which we shouldn't let assert() process
                // for diff reporting as that takes bloody ages:
            } else {
                fs.writeFileSync(filespec.outputRefPath, refOut, 'utf8');
                filespec.ref = refOut;
            }
            fs.writeFileSync(filespec.outputOutPath, refOut, 'utf8');

            // now that we have saved all data, perform the validation checks:
            testsetSpec.assertOutputMatchesReference(refOut, filespec.ref, 'grammar should be parsed correctly');
        });
    });
});




/*

# build *AND* run the test:
issue-254:
  $(JISON) --main ./$@.jison
  node ./output/$@/$@.js

# build *AND* run the test:
issue-293:
  $(JISON) --main ./$@.jison
  node ./output/$@/$@.js

# build *AND* run the test:
issue-289:
  $(JISON) --main -t -p lalr ./$@.jison
  node ./output/$@/$@.js

json_js:
  -mkdir -p ./output/$@
  node ./json.js > ./output/$@/$@.js

json_ast_js:
  -mkdir -p ./output/$@
  node ./json_ast.js > ./output/$@/$@.js

# input test file:  ./semwhitespace_ex.src
semwhitespace:
  $(JISON) --main ./$@.jison semwhitespace_lex.jison

error-handling-and-yyclearin:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-loopfix:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-looping1:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-looping2:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-macro:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-part1:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-part2:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-part3:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-part4a:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-part4b:
  $(JISON) --main ./$@.jison

error-handling-and-yyerrok-part5:
  $(JISON) --main ./$@.jison

error-recognition-actions:
  $(JISON) --main ./$@.jison

no-prec-hack-needed:
  $(JISON) --main ./$@.jison
  node ./output/$@/$@.js

yacc-error-recovery:
  $(JISON) --main ./$@.jison

with_custom_lexer:
  $(JISON) --main ./$@.jison

klammergebirge:
  $(JISON) --main ./$@.jison

parser-to-lexer-communication-test--profiling:
  $(JISON) --main -p lr ./$@.jison
  node --prof ./output/$@/$@.js
  # and now collect the profile info and dump it to a report file:
  node --prof-process $$( ls -t isolate-*-v8.log | head -n 1 ) | sed -f ./profile-report-filter.sed > profile.$@.txt
  # and make sure the profile report is saved in a unique file which can be compared against other profile runs later on:
  cat profile.$@.txt > profile.$@.$$( date +%s%N ).txt

parser-to-lexer-communication-test:
  $(JISON) --main -p lr ./$@.jison
  node ./output/$@/$@.js

faking-multiple-start-rules:
  $(JISON) --main ./$@.jison

faking-multiple-start-rules-alt:
  $(JISON) --main ./$@.jison

# couple of examples which test theoretical grammars published in various papers about LR et al:

# build *AND* run the test:
lalr-but-not-slr:
  $(JISON) --main -p lalr ./$@.jison
  node ./output/$@/$@.js

# build *AND* run the test:
lr-but-not-lalr:
  $(JISON) --main -p lr ./$@.jison
  node ./output/$@/$@.js

# build *AND* run the test:
theory-left-recurs-01:
  $(JISON) --main ./$@.jison
  node ./output/$@/$@.js


# example of the use of the `%import symbols ...` statement: multi-phase engines
compiled_calc:
  $(JISON) ./$@_parse.jison
  # test if the generated JavaScript is viable at all:
  node output/$@/$@_parse.js
  $(JISON) ./$@_codegen.jison
  # test if the generated JavaScript is viable at all:
  node output/$@/$@_codegen.js
  $(JISON) ./$@_print.jison
  # test if the generated JavaScript is viable at all:
  node output/$@/$@_print.js
  $(JISON) ./$@_sorcerer.jison
  # test if the generated JavaScript is viable at all:
  node output/$@/$@_sorcerer.js
  $(JISON) ./$@_BURG.jison
  # test if the generated JavaScript is viable at all:
  node output/$@/$@_BURG.js
  $(JISON) ./$@_parse_for_fast_engine.jison
  # test if the generated JavaScript is viable at all:
  node output/$@/$@_parse_for_fast_engine.js
  #$(JISON) --main -t ./$@_exec.jison
  $(JISON) --main ./$@_exec.jison
  # postprocess generated source code:
  #node ./$@_const_rewrite_postprocess.js ./$@_AST_symbols.json5 output/$@/$@_exec.js
  node ./$@_const_rewrite_postprocess.js ./output/$@/$@_parse.js ./$@_OPA_defines.json5 output/$@/$@_exec.js
  #node ./$@_const_rewrite_postprocess.js ./output/$@/$@_parse.js output/$@/$@_exec.js
  #node ./$@_const_rewrite_postprocess.js ./$@_OPA_defines.json5 output/$@/$@_exec.js
  # and run it!
  node output/$@/$@_exec.js $@_input.txt



*/
