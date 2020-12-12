{
  error: {
    message: `
There's probably an error in one or more of your lexer regex rules.
The lexer rule spec should have this structure:
    
        regex  action_code
    
where 'regex' is a lex-style regex expression (see the
jison and jison-lex documentation) which is intended to match a chunk
of the input to lex, while the 'action_code' block is the JS code
which will be invoked when the regex is matched. The 'action_code' block
may be any (indented!) set of JS statements, optionally surrounded
by '{...}' curly braces or otherwise enclosed in a '%{...%}' block.
    
  Erroneous code:
3: "["[^\\]]"]" %{
4: return true;
5: %}
6: }
^..^
7: 
8: 
    
  Technical error report:
Parse error on line 6:
}
^
Expecting end of input, "<", ">", "|", "(", "/", ",", ".", "^", "$", "ACTION_START_AT_SOL", "UNTERMINATED_ACTION_BLOCK", "ACTION_START", "UNKNOWN_DECL", "OPTIONS", "IMPORT", "INIT_CODE", "START_INC", "START_EXC", "%%", "SPECIAL_GROUP", "/!", "REGEX_SPECIAL_CHAR", "ESCAPED_CHAR", macro name in '{...}' curly braces, "REGEX_SET_START", "STRING_LIT", "CHARACTER_LIT", "option_keyword", "import_keyword", "init_code_keyword", "start_inclusive_keyword", "start_exclusive_keyword", "start_conditions_marker", "start_epilogue_marker", "scoped_rules_collective", "rule", "start_conditions", "regex", "nonempty_regex_list", "regex_concat", "regex_base", "name_expansion", "any_group_regex", "literal_string", "epilogue", got unexpected "}"
`,
    type: 'JisonParserError',
    stack: `JisonParserError: 
There's probably an error in one or more of your lexer regex rules.
The lexer rule spec should have this structure:
    
        regex  action_code
    
where 'regex' is a lex-style regex expression (see the
jison and jison-lex documentation) which is intended to match a chunk
of the input to lex, while the 'action_code' block is the JS code
which will be invoked when the regex is matched. The 'action_code' block
may be any (indented!) set of JS statements, optionally surrounded
by '{...}' curly braces or otherwise enclosed in a '%{...%}' block.
    
  Erroneous code:
3: "["[^\\]]"]" %{
4: return true;
5: %}
6: }
^..^
7: 
8: 
    
  Technical error report:
Parse error on line 6:
}
^
Expecting end of input, "<", ">", "|", "(", "/", ",", ".", "^", "$", "ACTION_START_AT_SOL", "UNTERMINATED_ACTION_BLOCK", "ACTION_START", "UNKNOWN_DECL", "OPTIONS", "IMPORT", "INIT_CODE", "START_INC", "START_EXC", "%%", "SPECIAL_GROUP", "/!", "REGEX_SPECIAL_CHAR", "ESCAPED_CHAR", macro name in '{...}' curly braces, "REGEX_SET_START", "STRING_LIT", "CHARACTER_LIT", "option_keyword", "import_keyword", "init_code_keyword", "start_inclusive_keyword", "start_exclusive_keyword", "start_conditions_marker", "start_epilogue_marker", "scoped_rules_collective", "rule", "start_conditions", "regex", "nonempty_regex_list", "regex_concat", "regex_base", "name_expansion", "any_group_regex", "literal_string", "epilogue", got unexpected "}"

    at Object.parseError (/regexp-lexer-cjs.js:7291:15)
    at Object.yyError (/regexp-lexer-cjs.js:7481:25)
    at Object.parser__PerformAction (/regexp-lexer-cjs.js:2938:14)
    at Object.parse (/regexp-lexer-cjs.js:8545:24)
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