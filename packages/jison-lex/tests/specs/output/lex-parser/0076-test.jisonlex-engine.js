{
  error: {
    message: 'regex [[\\[[abc \\xA0 \\u1234 \\166 def]\\]]]: expands to an invalid regex: /\\[[abc \\xA0 \\u1234 \\166 def]\\]/',
    type: 'Error',
    stack: `Error: regex [[\\[[abc \\xA0 \\u1234 \\166 def]\\]]]: expands to an invalid regex: /\\[[abc \\xA0 \\u1234 \\166 def]\\]/
    at reduceRegex (/regexp-lexer-cjs.js:14748:16)
    at expandMacros (/regexp-lexer-cjs.js:15072:14)
    at prepareRules (/regexp-lexer-cjs.js:14452:17)
    at buildActions (/regexp-lexer-cjs.js:15124:15)
    at processGrammar (/regexp-lexer-cjs.js:17678:30)
    at test_me (/regexp-lexer-cjs.js:15394:23)
    at new RegExpLexer (/regexp-lexer-cjs.js:15535:17)
    at Context.testEachLexerExample (/regexplexer.js:3707:25)
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