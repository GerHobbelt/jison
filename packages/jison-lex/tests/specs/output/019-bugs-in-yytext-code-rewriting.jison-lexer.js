{
  error: {
    message: `The expression evaluated to a falsy value:

  assert__default['default'](Array.isArray(rule))
`,
    type: 'AssertionError',
    stack: `AssertionError [ERR_ASSERTION]: The expression evaluated to a falsy value:

  assert__default['default'](Array.isArray(rule))

    at /regexp-lexer-cjs.js:14807:59
    at test_me (/regexp-lexer-cjs.js:14640:13)
    at /regexp-lexer-cjs.js:14794:30
    at test_me (/regexp-lexer-cjs.js:14744:17)
    at new RegExpLexer (/regexp-lexer-cjs.js:14753:17)
    at Context.testEachLexerExample (/regexplexer.js:3738:25)
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