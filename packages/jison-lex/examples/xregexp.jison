// title: Simple lexer example
//  
// test_input: "πyαε"

%code imports %{
  const XRegExp = require('@gerhobbelt/xregexp');        // for helping out the `%options xregexp` in the lexer
%}

%options xregexp


%%


π   					return 'PI';

\p{Alphabetic}			return 'Y';

[\p{Number}]			return 'N';

<<EOF>>      			return 'EOF'

