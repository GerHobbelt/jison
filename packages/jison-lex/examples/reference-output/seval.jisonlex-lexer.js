{
  error: {
    message: `Could not parse jison lexer spec in JSON AUTODETECT mode:
in JISON Mode we get Error: $MACRO_NAME is not defined

while JSON5 Mode produces Error: JSON5: invalid character 'D' at 2:1`,
    type: 'Error',
    stack: `SyntaxError: JSON5: invalid character 'D' at 2:1
    at syntaxError (/index.js:1954:16)
    at invalidChar (/index.js:1895:13)
    at Object.value (/index.js:964:16)
    at lex (/index.js:743:41)
    at Object.parse (/index.js:689:18)
    at autodetectAndConvertToJSONformat (/regexp-lexer-cjs.js:13480:51)
    at processGrammar (/regexp-lexer-cjs.js:16566:12)
    at test_me (/regexp-lexer-cjs.js:14477:23)
    at new RegExpLexer (/regexp-lexer-cjs.js:14595:17)
    at Context.testEachLexerExample (/regexplexer.js:3724:25)
    at callFn (/runnable.js:364:21)
    at Test.Runnable.run (/runnable.js:352:5)
    at Runner.runTest (/runner.js:677:10)
    at /runner.js:801:12
    at next (/runner.js:594:14)
    at /runner.js:604:7
    at next (/runner.js:486:14)
    at cbHookRun (/runner.js:551:7)
    at done (/runnable.js:308:5)
    at callFn (/runnable.js:387:7)
    at Hook.Runnable.run (/runnable.js:352:5)
    at next (/runner.js:510:10)
    at Immediate._onImmediate (/runner.js:572:5)
    at processImmediate (/timers.js:456:21)`,
  },
}