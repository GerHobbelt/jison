{
  error: {
    message: `
The '%{...%}' lexer setup action code section does not compile: Line 54: Unexpected identifier
    
  Erroneous area:
 54: %{
^^^..^^
 55: #undef YY_READ_BUF_SIZE
^^^..^^^^^^^^^^^^^^^^^^^^^^^
     (...continued...)
---  (---------------)
165: static void get_new_listing_file (void);
^^^..^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
166: 
^^^..^
167: %}
^^^..^^
168: 
169: WORD  [_0-9A-Z\\x80-\\xFF-]+
`,
    type: 'JisonParserError',
    stack: `JisonParserError: 
The '%{...%}' lexer setup action code section does not compile: Line 54: Unexpected identifier
    
  Erroneous area:
 54: %{
^^^..^^
 55: #undef YY_READ_BUF_SIZE
^^^..^^^^^^^^^^^^^^^^^^^^^^^
     (...continued...)
---  (---------------)
165: static void get_new_listing_file (void);
^^^..^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
166: 
^^^..^
167: %}
^^^..^^
168: 
169: WORD  [_0-9A-Z\\x80-\\xFF-]+

    at Object.parseError (/regexp-lexer-cjs.js:7206:15)
    at Object.yyError (/regexp-lexer-cjs.js:7396:25)
    at Object.parser__PerformAction (/regexp-lexer-cjs.js:3265:22)
    at Object.parse (/regexp-lexer-cjs.js:8663:24)
    at Object.yyparse [as parse] (/regexp-lexer-cjs.js:12386:25)
    at autodetectAndConvertToJSONformat (/regexp-lexer-cjs.js:13580:35)
    at processGrammar (/regexp-lexer-cjs.js:16769:12)
    at test_me (/regexp-lexer-cjs.js:14635:23)
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