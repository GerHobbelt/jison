{
  error: {
    message: `
The lexer rule's 'arrow' action code section does not compile: Error: Line 8: Unexpected end of input
    
# NOTE that the arrow action automatically wraps the action code
# in a \`return (...);\` statement to prevent hard-to-diagnose run-time
# errors down the line.
#
# Please be aware that the reported compile error MAY be referring
# to the wrapper code which is added by JISON automatically when
# processing arrow actions: the entire action code chunk
# (including wrapper) is:
    
    return (
        // nada => error in arrow function!
    )
    
  Erroneous area:
6: 'foo'    -> // nada => error in arrow function!
^.............^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
`,
    type: 'JisonParserError',
    stack: `JisonParserError: 
The lexer rule's 'arrow' action code section does not compile: Error: Line 8: Unexpected end of input
    
# NOTE that the arrow action automatically wraps the action code
# in a \`return (...);\` statement to prevent hard-to-diagnose run-time
# errors down the line.
#
# Please be aware that the reported compile error MAY be referring
# to the wrapper code which is added by JISON automatically when
# processing arrow actions: the entire action code chunk
# (including wrapper) is:
    
    return (
        // nada => error in arrow function!
    )
    
  Erroneous area:
6: 'foo'    -> // nada => error in arrow function!
^.............^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

    at Object.parseError (/regexp-lexer-cjs.js:8009:15)
    at Object.yyError (/regexp-lexer-cjs.js:8194:25)
    at Object.parser__PerformAction (/regexp-lexer-cjs.js:4618:18)
    at Object.parse (/regexp-lexer-cjs.js:9472:24)
    at Object.yyparse [as parse] (/regexp-lexer-cjs.js:13065:25)
    at autodetectAndConvertToJSONformat (/regexp-lexer-cjs.js:14305:35)
    at processGrammar (/regexp-lexer-cjs.js:17656:12)
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