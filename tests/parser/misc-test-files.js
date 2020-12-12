const assert = require('chai').assert;
const fs = require('fs');
const path = require('path');
const yaml = require('@gerhobbelt/js-yaml');
const JSON5 = require('@gerhobbelt/json5');
const globby = require('globby');
const helpers = require('../../helpers-lib/dist/helpers-lib-cjs');
const trimErrorForTestReporting = helpers.trimErrorForTestReporting;
const stripErrorStackPaths = helpers.stripErrorStackPaths;
const cleanStackTrace4Comparison = helpers.cleanStackTrace4Comparison;
const mkdirp = helpers.mkdirp;
const Jison = require('../../dist/jison-cjs');





function generator_reset() {
    //bnf.bnf_parser.parser.yy = {};

    let debug = 0;

    if (!debug) {
        // silence warn+log messages from the test internals:
        bnf.bnf_parser.parser.warn = function bnf_warn() {
            // console.warn("TEST WARNING: ", arguments);
        };

        bnf.bnf_parser.parser.log = function bnf_log() {
            // console.warn("TEST LOG: ", arguments);
        };
    }
}








function cleanPath(filepath) {
    // does input path contain a Windows Drive or Network path? 
    // If so, prevent bugs in path.join() re Windows paths to kick in 
    // while the input path is an absolute path already anyway:
    if (!filepath.includes(':')) {
        filepath = path.join(__dirname, filepath);
    }
    return path.normalize(filepath).replace(/\\/g, '/');  // UNIXify the path
}


console.log('exec glob....', __dirname);
const original_cwd = process.cwd();
process.chdir(__dirname);
var testset = globby.sync([
    '../specs/*.jison',
]);

testset = testset.sort();

testset = testset.map(function (filepath) {
    // Get document, or throw exception on error
    try {
        console.log('Parser Spec file:', filepath.replace(/^.*?\/specs\//, ''));
        let spec;
        let header;
        let extra;
        let grammar;

        filepath = cleanPath(filepath);

        spec = fs.readFileSync(filepath, 'utf8').replace(/\r\n|\r/g, '\n');

        // extract the top comment, which carries the title, etc. metadata:
        header = spec.substr(0, spec.indexOf('\n\n') + 1);

        // extract the grammar to test:
        grammar = spec.substr(spec.indexOf('\n\n') + 2);

        // then strip off the comment prefix for every line:
        header = header.replace(/^\/\/ ?/gm, '').replace(/\n...\n[^]*$/, function (m) {
            extra = m;
            return '';
        });

        let doc = yaml.safeLoad(header, {
            filename: filepath
        });

        if (doc.crlf && typeof grammar === 'string') {
            grammar = grammar.replace(/\n/g, '\r\n');
        }

        let refOutFilePath = cleanPath(path.join(path.dirname(filepath), 'reference-output', path.basename(filepath) + '-ref.json5'));
        let testOutFilePath = cleanPath(path.join(path.dirname(filepath), 'output', path.basename(filepath) + '-ref.json5'));
        let generatorRefFilePath = cleanPath(path.join(path.dirname(filepath), 'reference-output', path.basename(filepath) + '-lex.json5'));
        let generatorOutFilePath = cleanPath(path.join(path.dirname(filepath), 'output', path.basename(filepath) + '-lex.json5'));
        mkdirp(path.dirname(refOutFilePath));
        mkdirp(path.dirname(testOutFilePath));

        let refOut;
        try {
            var soll = fs.readFileSync(refOutFilePath, 'utf8').replace(/\r\n|\r/g, '\n');
            if (doc.crlf) {
                soll = soll.replace(/\n/g, '\r\n');
            }
            refOut = JSON5.parse(soll);
        } catch (ex) {
            refOut = null;
        }

        let generatorRefOut;
        try {
            var soll = fs.readFileSync(generatorRefFilePath, 'utf8').replace(/\r\n|\r/g, '\n');
            if (doc.crlf) {
                soll = soll.replace(/\n/g, '\r\n');
            }
            generatorRefOut = JSON5.parse(soll);
        } catch (ex) {
            generatorRefOut = null;
        }

        return {
            path: filepath,
            outputRefPath: refOutFilePath,
            outputOutPath: testOutFilePath,
            generatorRefPath: generatorRefFilePath,
            generatorOutPath: generatorOutFilePath,
            spec: spec,
            grammar: grammar,
            meta: doc,
            metaExtra: extra,
            generatorRef: generatorRefOut,
            ref: refOut
        };
    } catch (ex) {
        console.log(ex);
        throw ex;
    }
    return false;
})
.filter(function (info) {
    return !!info;
});
console.error({ testset });

function testrig_JSON5circularRefHandler(obj, circusPos, objStack, keyStack, key, err) {
    // and produce an alternative structure to JSON-ify:
    return {
        circularReference: true,
        // ex: {
        //   message: err.message,
        //   type: err.name
        // },
        index: circusPos,
        parentDepth: objStack.length - circusPos - 1,
        key: key,
        keyStack: keyStack    // stack & keyStack have already been snapshotted by the JSON5 library itself so passing a direct ref is fine here!
    };
}

function reduceWhitespace(src) {
    // replace tabs with space, clean out multiple spaces and kill trailing spaces:
    return src
      .replace(/\r\n|\r/g, '\n')
      .replace(/[ \t]+/g, ' ')
      .replace(/ +$/gm, '');
}










describe('JISON code generator', function () {
    beforeEach(function beforeEachTest() {
        generator_reset();
    });

    testset.forEach(function (filespec) {
        // process this file:
        let title = (filespec.meta ? filespec.meta.title : null);

        let testname = 'test: ' + filespec.path.replace(/^.*?\/specs\//, '') + (title ? ' :: ' + title : '');

        console.error('generate test: ', testname);

        // and create a test for it:
        it(testname, function testEachParserExample() {
            let err, ast, grammar;
            let tokens = [];
            let lexer = bnf.bnf_parser.parser.lexer;
            let i = 0;

            try {
                // Change CWD to the directory where the source grammar resides: this helps us properly
                // %include any files mentioned in the grammar with relative paths:
                process.chdir(path.dirname(filespec.path));

                grammar = filespec.grammar; // "%% test: foo bar | baz ; hello: world ;";

                ast = lexer.setInput(grammar);
                ast.__original_input__ = grammar;

                let countDown = 4;
                for (i = 0; i < 1000; i++) {
                    let tok = lexer.lex();
                    tokens.push({
                        id: tok,
                        token: bnf.bnf_parser.parser.describeSymbol(tok),
                        yytext: lexer.yytext,
                        yylloc: lexer.yylloc
                    });
                    if (tok === lexer.EOF) {
                        // and make sure EOF stays EOF, i.e. continued invocation of `lex()` will only
                        // produce more EOF tokens at the same location:
                        countDown--;
                        if (countDown <= 0) {
                            break;
                        }
                    }
                }
            } catch (ex) {
                // save the error:
                tokens.push(-1);
                err = ex;
                tokens.push({
                    fail: 1,
                    meta: filespec.spec.meta,
                    err: trimErrorForTestReporting(ex)
                });
                // and make sure ast !== undefined:
                if (!ast) {
                    ast = { fail: 1 };
                }
            } finally {
                process.chdir(original_cwd);
            }

            // also store the number of tokens we received:
            tokens.unshift(i);
            // if (lexerSourceCode) {
            //   tokens.push(lexerSourceCode);
            // }

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
                circularRefHandler: testrig_JSON5circularRefHandler
            });

            // strip away devbox-specific paths in error stack traces in the output:
            refOut = stripErrorStackPaths(refOut);

            // and convert it back so we have a `tokens` set that's cleaned up
            // and potentially matching the stored reference set:
            tokens = JSON5.parse(refOut);
            if (filespec.generatorRef) {
                // Perform the validations only AFTER we've written the files to output:
                // several tests produce very large outputs, which we shouldn't let assert() process
                // for diff reporting as that takes bloody ages:
                //assert.deepEqual(ast, filespec.ref);
            } else {
                fs.writeFileSync(filespec.generatorRefPath, refOut, 'utf8');
                filespec.generatorRef = tokens;
            }
            fs.writeFileSync(filespec.generatorOutPath, refOut, 'utf8');

            // now that we have saved all data, perform the validation checks:
            assert.deepEqual(cleanStackTrace4Comparison(tokens), cleanStackTrace4Comparison(filespec.generatorRef), 'grammar should be lexed correctly');
        });
    });
});







