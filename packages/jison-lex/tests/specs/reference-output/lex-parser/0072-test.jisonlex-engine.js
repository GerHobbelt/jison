{
  error: {
    message: `
There's probably an error in one or more of your lexer regex rules.
    
Did you perhaps indent the rule regex? 
    
Note that all rule regexes MUST start at the start of the line, 
i.e. text column 1. 
Indented text is perceived as JavaScript action code related to the last 
lexer rule regex.
    
  Erroneous code:
 8: %%
 9: "a" %{  //
10: return true;
11: %}  //
^^......^^
12:   //
13: "b" %{    return 11;
    
  Technical error report:
Parse error on line 11:
%}  //
----^
Unexpected "ACTION_BODY"
`,
    type: 'JisonParserError',
    stack: `JisonParserError: 
There's probably an error in one or more of your lexer regex rules.
    
Did you perhaps indent the rule regex? 
    
Note that all rule regexes MUST start at the start of the line, 
i.e. text column 1. 
Indented text is perceived as JavaScript action code related to the last 
lexer rule regex.
    
  Erroneous code:
 8: %%
 9: "a" %{  //
10: return true;
11: %}  //
^^......^^
12:   //
13: "b" %{    return 11;
    
  Technical error report:
Parse error on line 11:
%}  //
----^
Unexpected "ACTION_BODY"

    at Object.parseError (/regexp-lexer-cjs.js:7935:15)
    at Object.yyError (/regexp-lexer-cjs.js:8120:25)
    at Object.parser__PerformAction (/regexp-lexer-cjs.js:4803:18)
    at Object.parse (/regexp-lexer-cjs.js:9189:24)
    at Object.yyparse [as parse] (/regexp-lexer-cjs.js:12991:25)
    at autodetectAndConvertToJSONformat (/regexp-lexer-cjs.js:14231:35)
    at processGrammar (/regexp-lexer-cjs.js:17582:12)
    at test_me (/regexp-lexer-cjs.js:15320:23)
    at new RegExpLexer (/regexp-lexer-cjs.js:15461:17)
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