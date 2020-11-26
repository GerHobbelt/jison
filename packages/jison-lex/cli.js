
import fs from 'fs';
import path from 'path';
import nomnom from '@gerhobbelt/nomnom';

import helpers from '../helpers-lib';
const mkIdentifier = helpers.mkIdentifier;
const mkdirp = helpers.mkdirp;

import RegExpLexer from './regexp-lexer.js';

import assert from 'assert';


assert(RegExpLexer);
assert(RegExpLexer.defaultJisonLexOptions);
assert(typeof RegExpLexer.mkStdOptions === 'function');


const version = '0.7.0-220';                              // require('./package.json').version;


function getCommandlineOptions() {
    const defaults = RegExpLexer.defaultJisonLexOptions;
    let opts = nomnom
        .script('jison-lex')
        .unknownOptionTreatment(false)              // do not accept unknown options!
        .options({
            file: {
                flag: true,
                position: 0,
                help: 'file containing a lexical grammar.'
            },
            json: {
                abbr: 'j',
                flag: true,
                default: defaults.json,
                help: 'jison will expect a grammar in either JSON/JSON5 or JISON format: the precise format is autodetected.'
            },
            outfile: {
                abbr: 'o',
                metavar: 'FILE',
                help: 'Filepath and base module name of the generated parser. When terminated with a "/" (dir separator) it is treated as the destination directory where the generated output will be stored.'
            },
            debug: {
                abbr: 't',
                flag: true,
                default: defaults.debug,
                transform: function (val) {
                    console.error('debug arg:', {val});
                    return parseInt(val);
                },
                help: 'Debug mode.'
            },
            dumpSourceCodeOnFailure: {
                full: 'dump-sourcecode-on-failure',
                flag: true,
                default: defaults.dumpSourceCodeOnFailure,
                help: 'Dump the generated source code to a special named file when the internal generator tests fail, i.e. when the generated source code does not compile in the JavaScript engine. Enabling this option helps you to diagnose/debug crashes (thrown exceptions) in the code generator due to various reasons: you can, for example, load the dumped sourcecode in another environment (e.g. NodeJS) to get more info on the precise location and cause of the compile failure.'
            },
            throwErrorOnCompileFailure: {
                full: 'throw-on-compile-failure',
                flag: true,
                default: defaults.throwErrorOnCompileFailure,
                help: 'Throw an exception when the generated source code fails to compile in the JavaScript engine. **WARNING**: Turning this feature OFF permits the code generator to produce non-working source code and treat that as SUCCESS. This MAY be desirable code generator behaviour, but only rarely.'
            },
            reportStats: {
                full: 'info',
                abbr: 'I',
                flag: true,
                default: defaults.reportStats,
                help: 'Report some statistics about the generated lexer.'
            },
            moduleType: {
                full: 'module-type',
                abbr: 'm',
                default: defaults.moduleType,
                metavar: 'TYPE',
                choices: [ 'commonjs', 'amd', 'js', 'es' ],
                help: 'The type of module to generate (commonjs, amd, es, js)'
            },
            moduleName: {
                full: 'module-name',
                abbr: 'n',
                metavar: 'NAME',
                help: 'The name of the generated parser object, namespace supported.'
            },
            main: {
                full: 'main',
            	abbr: 'x',
                flag: true,
                default: !defaults.noMain,
                help: 'Include .main() entry point in generated commonjs module.'
            },
            moduleMain: {
                full: 'module-main',
                abbr: 'y',
                metavar: 'NAME',
                help: 'The main module function definition.'
            },
            prettyCfg: {
                full: 'pretty',
                flag: true,
                metavar: 'false|true|CFGFILE',
                default: defaults.prettyCfg,
                transform: function (val) {
                    console.log("prettyCfg:", {val});
                    switch (val) {
                    case 'false':
                    case '0':
                        return false;

                    case 'true':
                    case '1':
                        return true;

                    default:
                        try {
                            let src = fs.readFileSync(val, "utf8");
                            let cfg = JSON5.parse(src);
                            return cfg;
                        } catch (ex) {
                            console.error(rmCommonWS`
                                Cannot open/read/decode the prettyPrint config file '${val}'.

                                Error: ${ex.message}

                            `);
                            throw ex;
                        }
                    }
                },
                help: "Output the generated code pretty-formatted; turning this option OFF will output the generated code as-is a.k.a. 'raw'."
            },
            version: {
                abbr: 'V',
                flag: true,
                help: 'Print version and exit.',
                callback: function () {
                    console.log(version);
                    process.exit(0);
                }
            }
        }).parse();

    if (opts.debug) {
        console.log('JISON-LEX CLI options:\n', opts);
    }

    return opts;
}


function cliMain(opts) {

    opts = RegExpLexer.mkStdOptions(opts);

    function isDirectory(fp) {
        try {
            return fs.lstatSync(fp).isDirectory();
        } catch (e) {
            return false;
        }
    }

    function processInputFile() {
        // getting raw files
        let lex;
        let original_cwd = process.cwd();

        try {
            let raw = fs.readFileSync(path.normalize(opts.file), 'utf8');

            // making best guess at json mode
            opts.json = (path.extname(opts.file) === '.json' || opts.json);

            // When only the directory part of the output path was specified, then we
            // do NOT have the target module name in there as well!
            let outpath = opts.outfile;
            if (typeof outpath === 'string') {
                if (/[\\\/]$/.test(outpath) || isDirectory(outpath)) {
                    opts.outfile = null;
                    outpath = outpath.replace(/[\\\/]$/, '');
                } else {
                    outpath = path.dirname(outpath);
                }
            } else {
                outpath = null;
            }
            if (outpath && outpath.length > 0) {
                outpath += '/';
            } else {
                outpath = '';
            }

            // setting output file name and module name based on input file name
            // if they aren't specified.
            let name = path.basename(opts.outfile || opts.file);

            // get the base name (i.e. the file name without extension)
            // i.e. strip off only the extension and keep any other dots in the filename
            name = path.basename(name, path.extname(name));

            opts.outfile = opts.outfile || (outpath + name + '.js');
            if (!opts.moduleName && name) {
                opts.moduleName = opts.defaultModuleName = mkIdentifier(name);
            }

            // Change CWD to the directory where the source grammar resides: this helps us properly
            // %include any files mentioned in the grammar with relative paths:
            let new_cwd = path.dirname(path.normalize(opts.file));
            process.chdir(new_cwd);

            opts.outfile = path.normalize(opts.outfile);
            mkdirp(path.dirname(opts.outfile));

            let lexer = cli.generateLexerString(raw, opts);

            // and change back to the CWD we started out with:
            process.chdir(original_cwd);

            fs.writeFileSync(opts.outfile, lexer);
            console.log('JISON-LEX output for module [' + opts.moduleName + '] has been written to file:', opts.outfile);
        } catch (ex) {
            console.error('JISON-LEX failed to compile module [' + opts.moduleName + ']:', ex);
        } finally {
            // reset CWD to the original path, no matter what happened
            process.chdir(original_cwd);
        }
    }

    function readin(cb) {
        const stdin = process.openStdin();
        let data = '';

        stdin.setEncoding('utf8');
        stdin.addListener('data', function (chunk) {
            data += chunk;
        });
        stdin.addListener('end', function () {
            cb(data);
        });
    }

    function processStdin() {
        readin(function processStdinReadInCallback(raw) {
            console.log(cli.generateLexerString(raw, opts));
        });
    }

    // if an input file wasn't given, assume input on stdin
    if (opts.file) {
        processInputFile();
    } else {
        processStdin();
    }
}


function generateLexerString(lexerSpec, opts) {
    // var settings = RegExpLexer.mkStdOptions(opts);
    let predefined_tokens = null;

    return RegExpLexer.generate(lexerSpec, predefined_tokens, opts);
}

var cli = {
    main: cliMain,
    generateLexerString: generateLexerString
};


export default cli;


if (require.main === module) {
    const opts = getCommandlineOptions();
    cli.main(opts);
}

