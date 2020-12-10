//
// title: "regression of bare action code chunk parsing"
// test_input: 5% E 21.5       % Z99
//
// ...
//

%s PERCENT_ALLOWED

%%

// `%`: the grammar is not LALR(1) unless we make the lexer smarter and have 
// it disambiguate the `%` between `percent` and `modulo` functionality by 
// additional look-ahead:
// we introduce a lexical predicate here to disambiguate the `%` and thus 
// keep the grammar LALR(1)!
//      https://developer.mozilla.org/en/docs/Web/JavaScript/Guide/Regular_Expressions
// we also use an (inclusive) lexical scope which turns this rule on only 
// immediately after a number was lexed previously.

<PERCENT_ALLOWED>"%"(?=\s*(?:[^0-9)]|E\b|PI\b|$))
                      // followed by another operator, i.e. anything that's 
                      // not a number, or The End: then this is a unary 
                      // `percent` operator.
                      //
                      // `1%-2` would be ambiguous but isn't: the `-` is 
                      // considered as a unary minus and thus `%` is a 
                      // `modulo` operator.
                      //
                      // `1%*5` thus is treated the same: any operator 
                      // following the `%` is assumed to be a *binary* 
                      // operator. Hence `1% times 5` which brings us to 
                      // operators which only exist in unary form: `!`, and 
                      // values which are not numbers, e.g. `PI` and `E`:
                      // how about
                      // - `1%E` -> modulo E,
                      // - `1%!0` -> modulo 1 (as !0 -> 1)
                      //
                      // Of course, the easier way to handle this would be to 
                      // keep the lexer itself dumb and put this additional 
                      // logic inside a post_lex handler which should then be 
                      // able to obtain additional look-ahead tokens and queue 
                      // them for later, while using those to inspect and 
                      // adjust the lexer output now -- a trick which is used 
                      // in the cockroachDB SQL parser code, for example.
                      //
                      // The above regex solution however is a more local 
                      // extra-lookahead solution and thus should cost us less 
                      // overhead than the suggested post_lex alternative, but 
                      // it comes at a cost itself: complex regex and 
                      // duplication of language knowledge in the lexer itself, 
                      // plus inclusion of *grammar* (syntactic) knowledge in 
                      // the lexer too, where it doesn't belong in an ideal 
                      // world...
                      console.log('percent: ', yytext);
                      return '%';

<PERCENT_ALLOWED>.                     
                      this.popState(); 
                      this.unput(yytext); 
                      // this.unput(yytext); can be used here instead of 
                      // this.reject(); which would only work when we set the 
                      // `backtrack_lexer` option




\s+                   /* skip whitespace */

[0-9]+("."[0-9]+)?\b  
                      this.pushState('PERCENT_ALLOWED'); 
                      return 'NUMBER';

<<EOF>>               return 'EOF';
.                     return 'CHAR';