{
  error: {
    message: `
\`the exclusive lexer start conditions set (%x)\` statements must be placed in
the top section of the lexer spec file, above the first '%%'
separator. You cannot specify any in the second section as has been
done here.
    
  Erroneous code:
 7: <subset>{
 8: 
 9: "C"   -> 'C'
10: %x      // is not accepted here
^^..^^
11: "B"   -> 'B'
12: 
`,
    type: 'JisonParserError',
    stack: `JisonParserError: 
\`the exclusive lexer start conditions set (%x)\` statements must be placed in
the top section of the lexer spec file, above the first '%%'
separator. You cannot specify any in the second section as has been
done here.
    
  Erroneous code:
 7: <subset>{
 8: 
 9: "C"   -> 'C'
10: %x      // is not accepted here
^^..^^
11: "B"   -> 'B'
12: 

    at Object.parseError (/regexp-lexer-cjs.js:7291:15)
    at Object.yyError (/regexp-lexer-cjs.js:7481:25)
    at Object.parser__PerformAction (/regexp-lexer-cjs.js:4325:14)
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