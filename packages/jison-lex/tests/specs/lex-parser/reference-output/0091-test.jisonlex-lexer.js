{
  error: {
    message: `
The '%{...%}' lexer setup action code section does not compile: Error: Line 4: Unexpected token ILLEGAL
    
  Erroneous area:
4: %{
^..^^
5:  Here's line A, which is not JavaScript.
^..^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
6: %}
^..^^
7: 
8: %%
`,
    type: 'JisonParserError',
    stack: `JisonParserError: 
The '%{...%}' lexer setup action code section does not compile: Error: Line 4: Unexpected token ILLEGAL
    
  Erroneous area:
4: %{
^..^^
5:  Here's line A, which is not JavaScript.
^..^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
6: %}
^..^^
7: 
8: %%

    at Object.parseError (/regexp-lexer-cjs.js:7291:15)
    at Object.yyError (/regexp-lexer-cjs.js:7481:25)
    at Object.parser__PerformAction (/regexp-lexer-cjs.js:3309:22)
    at Object.parse (/regexp-lexer-cjs.js:8748:24)
    at Object.yyparse [as parse] (/regexp-lexer-cjs.js:12609:25)
    at autodetectAndConvertToJSONformat (/regexp-lexer-cjs.js:13814:35)
    at processGrammar (/regexp-lexer-cjs.js:17013:12)
    at test_me (/regexp-lexer-cjs.js:14862:23)
    at new RegExpLexer (/regexp-lexer-cjs.js:14980:17)
    at Context.testEachLexerExample (/regexplexer.js:3741:25)
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