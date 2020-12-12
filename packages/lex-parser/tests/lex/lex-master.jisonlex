//
// title: full JISON-GHO lexer spec
// 
// ...
//



%code imports %{
  import helpers from '../helpers-lib';
%}



ASCII_LETTER                            [a-zA-z]
// \p{Alphabetic} already includes [a-zA-z], hence we don't need to merge
// with {UNICODE_LETTER} (though jison has code to optimize if you *did*
// include the `[a-zA-Z]` anyway):
UNICODE_LETTER                          [\p{Alphabetic}]
ALPHA                                   [{UNICODE_LETTER}_]
DIGIT                                   [\p{Number}]
WHITESPACE                              [\s\r\n\p{Separator}]
ALNUM                                   [{ALPHA}{DIGIT}]

NAME                                    [{ALPHA}](?:[{ALNUM}-]*{ALNUM})?
ID                                      [{ALPHA}]{ALNUM}*
DECIMAL_NUMBER                          [1-9][0-9]*
HEX_NUMBER                              "0"[xX][0-9a-fA-F]+
BR                                      \r\n|\n|\r
// WhiteSpace MUST NOT match CR/LF and the regex `\s` DOES, so we cannot use
// that one directly. Instead we define the {WS} macro here:
WS                                      [^\S\r\n]

// Quoted string content: support *escaped* quotes inside strings:
QUOTED_STRING_CONTENT                   (?:\\\'|\\[^\']|[^\\\'\r\n])*
DOUBLEQUOTED_STRING_CONTENT             (?:\\\"|\\[^\"]|[^\\\"\r\n])*
// backquoted ES6/ES2017 string templates MAY span multiple lines:
ES2017_STRING_CONTENT                   (?:\\\`|\\[^\`]|[^\\\`])*

// Accept any non-regex-special character as a direct literal without
// the need to put quotes around it:
ANY_LITERAL_CHAR                        [^\s\r\n<>\[\](){}.*+?:!=|%\/\\^$,\'\"\`;]



%s rules macro
%x code options action set



%options easy_keyword_rules
%options ranges
%options xregexp



%%

// Comments should be gobbled and discarded anywhere
// *except* the code/action blocks:
<INITIAL,macro,options,rules>"//"[^\r\n]*
                                        /* skip single-line comment */
<INITIAL,macro,options,rules>"/*"[^]*?"*/"
                                        /* skip multi-line comment */


//===================== <action> section start =============================
<action>{

// Here we recognize the action code blocks in a grammar parser spec, including those chunks of
// user-defined action code which are wrapped in `%{...%}` or `{{...}}`.
//
// These `%{...%}` and `{{...}}` chunks are special in that *anything
// **except the given 'end marker' (`%}` and `}}` respectively)** may
// exist within the markers: those contents will be copied verbatim.
//
// Note the 'fringe case' where one or more of those end markers
// is an integral part of your action code: you then have the choice to
// either use the other chunk format *or* not wrap [that part of] your
// code in any special marker block, but rely on the lexer rules for
// parsing a regular `{...}` JavaScript code chunk instead.
//
// Thus these won't lex/parse correctly:
//
// `%{ return '%}'; %}`
// `{{ return '{{}}'; }}`
// `{{ return '%{ {{ }} %}'; }}`
//
// while these would:
//
// `{{ return '%}'; }}`
// `%{ return '{{}}'; %}`
// `{ return '%{ {{ }} %}'; }`
// `{ return '%}'; }`
// `{ return '{{}}'; }`
//
// Since 0.6.5 we also allow another approach, which can be used instead:
// 'repeated `{` markers', which is like the `%{...%}` and `{{...}}` in that
// anything that's not the corresponding end marker is accepted as content
// as far as the lexer is concerned (the parser will want to check the validity
// of the entire action code block before using it as part of the generated
// lexer/parser kernel code though), e.g. these would lex as valid chunks:
//
// `%{{ return '%}'; %}}`
// `{{{ return '{{}}'; }}}`
// `{{{ return '%{ {{ }} %}'; }}}`
// `%{{{ return ['%}','%}}']; %}}}`
//
// To speed up the lexer and keep things simple, we test these lexer rules
// *only when we're sure to match them*, while we use an advanced
// feature of the lexer kernel by *generating the proper lexer rule regex on the fly*
// at the moment when we find we need it: for this we employ some
// intimate knowledge of the lexer kernel which will be generated for this
// lexer spec: for this we only the lexer rule for `%{...%}` to exist, as
// we will pick up that one and modify it on the fly as the need occurs.
//

"%include"                              if (yy.include_command_allowed) {
                                            // This is an include instruction in place of (part of) an action:
                                            this.pushState('options');
                                            return 'INCLUDE';
                                        } else {
                                            // TODO
                                            yyerror(rmCommonWS`
                                                %include statements must occur on a line on their own and cannot occur inside an action code block.
                                                Its use is not permitted at this position.

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            return 'INCLUDE_PLACEMENT_ERROR';
                                        }

"/*"[^]*?"*/"                           //yy.include_command_allowed = false; -- doesn't impact include-allowed state
                                        return 'ACTION_BODY';
"//".*                                  yy.include_command_allowed = false;
                                        return 'ACTION_BODY';

// make sure to terminate before the rule section ends,
// which is announced by `%%`:
"%%"                                    if (yy.depth === 0) {
                                            this.popState();
                                            this.unput(yytext);
                                            // yytext = '';    --- ommitted as this is the side-effect of .unput(yytext) already!
                                            return 'ACTION_END';
                                        } else {
                                            return 'ACTION_BODY';
                                        }

// regexp in action code handling:
//
// simply scan using an Esprima-equivalent regex scanner: when the next
// bit turns out to be a regex, assume it is one and pass it on.
//
// To prevent trouble with confusing this with a divide operator,
// only accept regexes which at least start with a non-whitespace
// character, otherwise we can bet it's a divide operator most
// probably.
"/"/\s                                  return 'ACTION_BODY';       // most probably a `/` divide operator.
"/".*
                                        yy.include_command_allowed = false;
                                        let l = scanRegExp(yytext);
                                        if (l > 0) {
                                            this.unput(yytext.substring(l));
                                            yytext = yytext.substring(0, l);
                                        } else {
                                            // assume it's a division operator:
                                            this.unput(yytext.substring(1));
                                            yytext = yytext[0];
                                        }
                                        return 'ACTION_BODY';

\"{DOUBLEQUOTED_STRING_CONTENT}\"   |
\'{QUOTED_STRING_CONTENT}\'         |
\`{ES2017_STRING_CONTENT}\`
                                        yy.include_command_allowed = false;
                                        return 'ACTION_BODY';

// Gobble an entire line of code unless there's chance there's
// a regex, string, comment, {...} block start or end brace or sentinel
// in it: then only gobble everything up to that particular
// character and let the lexer handle that one, and what follows,
// in the round. Meanwhile we have us some action code pass on.
[^/"'`\{\}{BR}]+                        yy.include_command_allowed = false;
                                        return 'ACTION_BODY';

"{"                                     yy.depth++;
                                        yy.include_command_allowed = false;
                                        return 'ACTION_BODY';
"}"                                     yy.include_command_allowed = false;
                                        if (yy.depth <= 0) {
                                            yyerror(rmCommonWS`
                                                too many closing curly braces in lexer rule action block.

                                                Note: the action code chunk may be too complex for jison to parse
                                                easily; we suggest you wrap the action code chunk in '%{...%}'
                                                to help jison grok more or less complex action code chunks.

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            return 'BRACKET_SURPLUS';
                                        } else {
                                            yy.depth--;
                                        }
                                        return 'ACTION_BODY';

// Note that lexer options & commands should be at the start-of-line, i.e.
// without leading whitespace. The only lexer command which we do accept
// here after the last indent is `%include`, which is considered (part
// of) the rule's action code block.
//
// Note that this rule is constructed to detect "some content follows on the next line":
// as long as this condition applies, we assume the action code block is continuing.
// Hence an *empty* line would signal the end of the action code block via the later {BR}
// rule below! 
// That 'empty' separating line which ends the action block MAY contain (trailing) whitespace.
//
{BR}{WS}+/!(?:{WS}|{BR})
                                        yy.include_command_allowed = true;
                                        return 'ACTION_BODY';           // keep empty lines as-is inside action code blocks.

{WS}+                                   return 'ACTION_BODY';

{BR}                                    if (yy.depth > 0) {
                                            yy.include_command_allowed = true;
                                            return 'ACTION_BODY';       // keep empty lines as-is inside action code blocks.
                                        } else {
                                            // end of action code chunk; allow parent mode to see this mode-terminating linebreak too.
                                            this.popState();
                                            this.unput(yytext);
                                            // yytext = '';    --- ommitted as this is the side-effect of .unput(yytext) already!
                                            return 'ACTION_END';
                                        }
<<EOF>>                                 yy.include_command_allowed = false;
                                        if (yy.depth !== 0) {
                                            yyerror(rmCommonWS`
                                                missing ${yy.depth} closing curly braces in lexer rule action block.

                                                Note: the action code chunk may be too complex for jison to parse
                                                easily; we suggest you wrap the action code chunk in '%{...%}'
                                                to help jison grok more or less complex action code chunks.

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            return 'BRACKET_MISSING';
                                        }
                                        this.popState();
                                        yytext = '';
                                        return 'ACTION_END';

}
//===================== <action> section end =============================



//
// Recognize any of these action code start markers:
// `%{`, `{{`, `%{{`, `{{{`, `%{{{`, ...
// and consume the *entire* action code block in one fell swoop.
//
// ---
//
// Here we recognize those action code blocks in a grammar parser spec
// which are wrapped in `%{...%}` or `{{...}}`.
//
// These `%{...%}` and `{{...}}` chunks are special in that *anything*
// **except the given 'end marker' (`%}` and `}}` respectively)** may
// exist within the markers: those contents will be copied verbatim.
//
// Note the 'fringe case' where one or more of those end markers
// is an integral part of your action code: you then have the choice to
// either use the other chunk format *or* not wrap [that part of] your
// code in any special marker block, but rely on the lexer rules for
// parsing a regular `{...}` JavaScript code chunk instead.
//
// Thus these won't lex/parse correctly:
//
// `%{ return '%}'; %}`
// `{{ return '{{}}'; }}`
// `{{ return '%{ {{ }} %}'; }}`
//
// while these would:
//
// `{{ return '%}'; }}`
// `%{ return '{{}}'; %}`
// `{ return '%{ {{ }} %}'; }`
// `{ return '%}'; }`
// `{ return '{{}}'; }`
//
// Since 0.6.5 we also allow another approach, which can be used instead:
// 'repeated `{` markers', which is like the `%{...%}` and `{{...}}` in that
// anything that's not the corresponding end marker is accepted as content
// as far as the lexer is concerned (the parser will want to check the validity
// of the entire action code block before using it as part of the generated
// lexer/parser kernel code though), e.g. these would lex as valid chunks:
//
// `%{{ return '%}'; %}}`
// `{{{ return '{{}}'; }}}`
// `{{{ return '%{ {{ }} %}'; }}}`
// `%{{{ return ['%}','%}}']; %}}}`
//
// To speed up the lexer and keep things simple, we test these lexer rules
// *only when we're pretty sure to match them*, where we *generate the 
// proper lexer regex on the fly* at the moment when we find we need it
// by invoking the `setupDelimitedActionChunkMatcher()` helpers API.
//
// The `setupDelimitedActionChunkMatcher()` API includes caching any 
// generated matcher in the current lexer instance, which persists for 
// the entire lifetime of the lexer instance. Thus, once generated, each 
// matcher will be available very quickly every time it is requested.
//
// The 0.7.0 lexer kernel includes a new `consume(N)` API, which helps 
// to advance the internal state (yylloc, etc.) once we have extracted
// the code chunk we seek, further simplifying the approach where a
// lexer rule regex is used to recognize the 'leader'/'heading' of a
// text chunk, where the action code then can employ various techniques 
// to extract the bulk of the input token, without having to resort to
// the costly `lexer.input()` API which is inherited from lex/flex and 
// only proceeds one character at a time. 
//
// Best practices would instead employ the `lexer.lookahead()` API and/or 
// `lexer.consume(N)`.
//
// Aside: 
// you will find another approach, using a lexer rule regex which gobbles 
// 'too much input' via `.*`, where the part trailing the extracted token 
// is then pushed back into the lexer kernel by way of `lexer.unput(str)`.
//
<INITIAL,rules,code,options>[%\{]\{+
                                    {
                                        yy.depth = 0;
                                        yy.include_command_allowed = false;
                                        //this.pushState('action');   <-- not needed as we'll consume the entire action code chunk all at once in here

                                        let marker = yytext;

                                        // check whether this `%{` marker was located at the start of the line:
                                        // if it is, we treat it as a different token to signal the grammar we've
                                        // got an action which stands on its own, i.e. is not a rule action, %code
                                        // section, etc...
                                        //let precedingStr = this.pastInput(1,2).replace(/[\r\n]/g, '\n');
                                        //let precedingStr = this.matched.substr(-this.match.length - 1, 1);
                                        let precedingStr = this.matched[this.matched.length - this.match.length - 1];

                                        let atSOL = (!precedingStr /* @ Start Of File */ || precedingStr === '\n');

                                        // Construct the proper lexer regex for any possible `%{...%}`, `{{...}}` or what have we here?
                                        const match = helpers.setupDelimitedActionChunkMatcher(marker, this);

                                        // Writing the wrong end marker is a common user mistake, we can
                                        // easily look ahead and check for it now and report a proper hint
                                        // to cover this failure mode in a more helpful manner.
                                        let remaining = this.lookAhead();
                                        let m = match(remaining);

                                        // move the lexer position forward as well:
                                        //
                                        // WARNING: this will modity yytext, hence we must set our own `yytext`
                                        // *afterwards*: see the statement after next!
                                        this.consume(m.shiftCount);

                                        // pick up the extraced action block itself:
                                        yytext = m;

                                        if (m.fault) {
                                            yyerror(rmCommonWS`
                                                ${m.fault}

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            return 'UNTERMINATED_ACTION_BLOCK';
                                        }

                                        if (atSOL) {
                                            return 'ENTIRE_ACTION_AT_SOL';
                                        }
                                        return 'ENTIRE_ACTION';
                                    }


"->"                                    yy.depth = 0;
                                        yy.include_command_allowed = false;
                                        this.pushState('action');
                                        return 'ARROW_ACTION_START';
"→"                                     yy.depth = 0;
                                        yy.include_command_allowed = false;
                                        this.pushState('action');
                                        return 'ARROW_ACTION_START';
"=>"                                    yy.depth = 0;
                                        yy.include_command_allowed = false;
                                        this.pushState('action');
                                        return 'ARROW_ACTION_START';


//
// The start marker recognition rule is "specially made" as we want to recognize
// `{{` markers as special markers, just like `%{`,
// while we also want to recognize `{` markers, but only while we are parsing lexer
// match rules.
// Meanwhile, the `<rules>{WS}+/!(?:"|"|"%"|"->"|"=>"|"→"|{WS}|{BR})` rule here
// had to be done this way to allow other modes to recognize indented `{...}`
// simple wrapped action code, while it now has been written as
// `<rules>{WS}+/!(?:"{{"|"|"|"%"|"->"|"=>"|"→"|{WS}|{BR})` to prevent the lexer
// from entering 'action' mode on the leading whitespace alone, thus turning `{{...}}` into the equivalent of
// `{ { ... } }`, which would **not** produce the same result as then we then won't be able
// to apply the patched `%{...%}` grab-all-at-once rule near the top of this file.
// (See also the code in the `setupDelimitedActionChunkLexerRegex()` function: with
// `{{` we intend to reap the same benefits as we do when using `%{` and friends,
// while we want `{` to act as a regular flavor curly brace everywhere.
//
// To accomplish that, we have to have this particular post-condition check set
// in this rule so we don't steal the `[%\{]\{+` rule's thunder when we hit upon
// whitespace-leaded `{{`: that rule must match the `{{` during the next round, while
// we now only ignore/skip the leading whitespace using another simple lexer
// rule further below.
//
// Now for some other notes:
//
// ACTION code chunks follow rules and are generally indented and
// may not start with the '%' character which is special to the JISON lex language itself:
// - `%` can start options, commands, etc., e.g. `%include` or `%options`,
//   of which only `%include` is allowed inside an action chunk (and recognized in another rule in this lexer).
// - `|` starts a rule alternative, never a chunk of action code.
// - `%%` delimits a lexer spec section and should always be placed at the start
//   of a new line, as are most other lexer spec entities.
// - also don't forget about the arrows: those should be lexed via whispace-skip and then
//   matching one of the rules above in the next `lex()` call.
//
// The `{WS}` and `{BR}` chunks in the postcondition of the lexer regex below is there to prevent
// it from matching all the whitepace up to, but not including, the last whitespace
// character on the line and consequently triggering the 'action' mode unwantedly.
// Writing this one was hard, while the same can be accomplished with some extra
// action code which calls `upcomingInput()`, `unput()` and `reject()` lexer kernel APIs,
// but we have decided to do it this way for educational purposes: this is the classic
// way to write non-trivial lexer specs and sometimes it's bloody tough. [GHo]
//
// ---
// 
// Update: when we're inside a *scoped rule block*, then lexer rules MAY be indented!

<rules>{WS}+/!(?:"{{"|"|"|"%"|"->"|"=>"|"→"|{WS}|{BR})
                                        {{
                                            // look back beyond match: if this is an *indentation* from the
                                            // start of the line, then we won't consider this a action code block start
                                            // but rather the start of an *indented* lexer rule regex.
                                            //
                                            // The quickest way to find out if a NL (NewLine) went just before is to
                                            // check our start column in `yylloc`.
                                            //
                                            // ## EXTRA ##:
                                            //
                                            // We only permit rule indentation inside a "start condition" scope block.
                                            // 
                                            // > Dev Notes:
                                            // >
                                            // > Allowing it anywhere would permit a lex spec file to look like a total
                                            // > mess. The 0110, etc. tests in /lex-parser/ allow indentation anywhere
                                            // > because we don't have an active parser there, hence the classic yacc/bison
                                            // > style "lexer hack" via the `yy` shared instance (`yy.__inside_scoped_ruleset__`)
                                            // > will not work in those tests YET.
                                            // > HOWEVER, when you inspect the same tests' results as run in /jison-lex/
                                            // > you'll notice the `lex.y` grammar kicking in and rejecting several of 
                                            // > those tests as they contain indented lexer rules WITHOUT an encompassing
                                            // > start condition scope.
                                            // 
                                            // PLUS we apply this HEURISTIC: when the 'indentation level' is TWO TABS or
                                            // 8 SPACES (1 TAB counts for 4 spaces) or more, it's considered as 
                                            // 'double indented' and automatically treated as action block source code.

                                            if (yy.__inside_scoped_ruleset__ === false || yylloc.first_column > 0 || /^ {8}/.test(yytext.replace(/\t/g, '    '))) {
                                                yy.depth = 0;
                                                yy.include_command_allowed = true;
                                                this.pushState('action');

                                                // Do a bit of magic that's useful for the parser when we
                                                // call `trimActionCode()` in there to perform a bit of
                                                // rough initial action code chunk cleanup:
                                                // when we start the action block -- hence *delimit* the
                                                // action block -- with a plain old '{' brace, we can
                                                // throw that one and its counterpart out safely without
                                                // damaging the action code in any way.
                                                //
                                                // In order to be able to detect that, we look ahead
                                                // now and see whether or not the rule's regex with the fancy
                                                // '/!' postcondition check actually hit a '{', which
                                                // is the only action code block starter we cannot
                                                // detect explicitly using any of the '%{.*?%}' lexer
                                                // rules you've seen further above.
                                                //
                                                // Thanks to this rule's regex, we DO know that the
                                                // first look-ahead character will be a non-whitespace
                                                // character, which would either be an action code block
                                                // delimiter *or* a comment starter. In the latter case
                                                // we just throw up our hands and leave code trimming
                                                // and analysis to the more advanced systems which
                                                // follow after `trimActionCode()` has passed once we
                                                // get to the parser productions which process this
                                                // upcoming action code block.
                                                let la = this.lookAhead();
                                                if (la[0] === '{') {
                                                    yytext = '{';           // hint the parser
                                                }

                                                return 'ACTION_START';
                                            }
                                            // else: ignore whitespace before a rule regex: *indentation* in a scope block.
                                        }}

<rules>"%%"                             this.popState();
                                        this.pushState('code');
                                        return '%%';
// Also support those lexers which don't have a trailing code section
// by faking a '%%' sentinel and an empty code section following that
// one:
<rules><<EOF>>                          this.popState();
                                        this.pushState('code');
                                        return '%%';


//===================== <options> section start =============================
<options>{

"="                                     return '=';

\"{DOUBLEQUOTED_STRING_CONTENT}\"       return 'OPTION_STRING';
\'{QUOTED_STRING_CONTENT}\'             return 'OPTION_STRING';
\`{ES2017_STRING_CONTENT}\`             return 'OPTION_STRING';

// make sure to terminate before the section ends,
// which is announced by `%%`, `|` or `;`:
"%%"|"|"|";"                            this.popState();
                                        this.unput(yytext);
                                        return 'OPTIONS_END';

<<EOF>>                                 this.popState();
                                        return 'OPTIONS_END';

// some options may be followed by an action block or `%include`d action block:
// when this happens, let the parser cope by stacking an 'action' mode inside
// the 'options' mode.
// This is necessary to get a different lexer token stream for these two scenarios,
// which are functionally different:
//
//     1:  %code option(s)... %{ action %}
//
//     2:  %code option(s)...
//         %{ action %}
//
// NOTE: we do not worry about *deep nesting* 'action' and 'options' modes
// via `%include` lexing, e.g.:
//
//     %code option(s)... %include 2nd_level_option(s) %include(illegal!) 3rd_level...
//
// While the lexer may not object (and thus *incorrectly reset `yy.depth` to
// ZERO(0) in the inner `%include` lex action above, for example!) the grammar/parser
// should be able to check against this eventuality and barf an appropriately
// formulated hairball. <wink>
//
"%include"                              yy.depth = 0;
                                        yy.include_command_allowed = true;
                                        this.pushState('action');
                                        // push the parsed '%include' back into the input-to-parse
                                        // to trigger the `<action>` state to re-parse it
                                        // and issue the desired follow-up token: 'INCLUDE':
                                        this.unput(yytext);
                                        return 'ACTION_START';

// The 'options' mode also serves to lex condition lists and a few other things...
// We don't mind and allow the lexer to be 'dumb' here as the parser will
// catch any abuse / incorrect input and report accordingly.
">"                                     this.popState();
                                        this.unput(yytext);
                                        return 'OPTIONS_END';
","                                     return ',';
"*"                                     return '*';

// The 'options' mode also serves to lex extended `%token` specs a la bison:
"<"{ID}">"                              yytext = this.matches[1];
                                        return 'TOKEN_TYPE';

{HEX_NUMBER}(?![{ANY_LITERAL_CHAR}])
                                        yytext = parseInt(yytext, 16); 
                                        return 'INTEGER';

-?{DECIMAL_NUMBER}(?![{ANY_LITERAL_CHAR}])
                                        yytext = parseInt(yytext, 10); 
                                        return 'INTEGER';

{ANY_LITERAL_CHAR}+                     return 'OPTION_VALUE';

/* skip leading whitespace on the next line of input, when followed by more option data */
{BR}{WS}+(?=\S)                         /* ignore */
/* otherwise the EOL marks the end of the options statement */
{BR}                                    %{
                                            // lexer rule condition sets can only be terminated by a '>':
                                            if (!yy.__inside_condition_set__) {
                                                this.popState();
                                                this.unput(yytext);
                                                return 'OPTIONS_END';
                                            } 
                                            /* else: ignore */
                                        %}
{WS}+                                   /* skip whitespace */

}
//===================== <options> section end =============================



<INITIAL>{ID}                           this.pushState('macro');
                                        return 'MACRO_NAME';

<macro>{BR}+                            this.popState();
                                        this.unput(yytext);
                                        return 'MACRO_END';

// Also support the rare 'custom lexer without a `%%` + rules':
<macro><<EOF>>                          this.popState();
                                        this.unput(yytext);
                                        return 'MACRO_END';

{BR}+                                   /* skip newlines */
{WS}+                                   /* skip whitespace */

\"{DOUBLEQUOTED_STRING_CONTENT}\"       return 'STRING_LIT';
\'{QUOTED_STRING_CONTENT}\'             return 'STRING_LIT';
\`{ES2017_STRING_CONTENT}\`             return 'STRING_LIT';

// Accept any non-regex-special character as a direct literal without
// the need to put quotes around it:
{ANY_LITERAL_CHAR}+                     // accept any non-regex, non-lex, non-string-delim,
                                        // non-escape-starter, non-space character as-is
                                        return 'CHARACTER_LIT';

"["                                     this.pushState('set');
                                        return 'REGEX_SET_START';
"|"                                     return '|';

// see also: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_Expressions
"(?:"                                   return 'SPECIAL_GROUP';
"(?="                                   return 'SPECIAL_GROUP';
"(?!"                                   return 'SPECIAL_GROUP';
// regex lookbehind prepwork: see also https://github.com/tc39/proposal-regexp-lookbehind
"(?<="                                  return 'SPECIAL_GROUP';
"(?<!"                                  return 'SPECIAL_GROUP';

"("                                     return '(';
")"                                     return ')';
"+"                                     return '+';
"*"                                     return '*';
"?"                                     return '?';
"^"                                     return '^';
","                                     return ',';
"<<EOF>>"                               return '$';

"<"                                     %{
                                            // '<' can only start a condition when it's at the very start of a regex rule or {...} regex rule set.
                                            // Either way, '<' must be at the start of the line, or it cannot be a condition starter but only
                                            // serve as a literal character in a regex.
                                            if (yylloc.first_column === 0) {
                                                yy.__inside_condition_set__ = true;
                                                this.pushState('options');
                                                return '<';
                                            }
                                            return 'CHARACTER_LIT';
                                        %}
">"                                     %{
                                            if (yy.__inside_condition_set__) {
                                                yy.__inside_condition_set__ = false;
                                                return '>';
                                            }
                                            return 'CHARACTER_LIT';
                                        %}

"/!"                                    return '/!';                    // treated as `(?!atom)`
"/"                                     return '/';                     // treated as `(?=atom)`
"\\"(?:[sSbBwWdDpP]|[rfntv\\*+()${}|[\]\/.^?])
                                        return 'REGEX_SPECIAL_CHAR';
"\\"(?:([0-7]{1,3})|c([A-Z])|x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|u\{([0-9a-fA-F]{1,8})\})
                                        %{
                                            let m = this.matches;
                                            yytext = NaN;
                                            if (m[1]) {
                                                // [1]: octal char: `\012` --> \x0A
                                                let v = parseInt(m[1], 8);
                                                yytext = v;
                                            }
                                            else if (m[2]) {
                                                // [2]: CONTROL char: `\cA` --> \u0001
                                                let v = m[2].charCodeAt(0) - 64;
                                                yytext = v;
                                            }
                                            else if (m[3]) {
                                                // [3]: hex char: `\x41` --> A
                                                let v = parseInt(m[3], 16);
                                                yytext = v;
                                            }
                                            else if (m[4]) {
                                                // [4]: unicode/UTS2 char: `\u03c0` --> PI
                                                let v = parseInt(m[4], 16);
                                                yytext = v;
                                            }
                                            else if (m[5]) {
                                                // [5]: unicode code point: `\u{00003c0}` --> PI
                                                let v = parseInt(m[5], 16);
                                                yytext = v;
                                            }
                                            return 'ESCAPED_CHAR';
                                        %}
"\\".                                   yytext = yytext.substring(1);
                                        return 'CHARACTER_LIT';
"$"                                     return '$';
"."                                     return '.';
"%option"[s]?                           this.pushState('options');
                                        return 'OPTIONS';
"%s"                                    this.pushState('options');
                                        return 'START_INC';
"%x"                                    this.pushState('options');
                                        return 'START_EXC';

"%code"                                 this.pushState('options');
                                        return 'INIT_CODE';
"%import"                               this.pushState('options');
                                        return 'IMPORT';
"%pointer"                              return 'FLEX_POINTER_MODE';
"%array"                                return 'FLEX_ARRAY_MODE';

<INITIAL,rules,code>"%include"          %{
                                            yy.depth = 0;
                                            yy.include_command_allowed = true;

                                            // check whether this `%include` command was located at the start of the line:
                                            // if it is, we treat it as a different token to signal the grammar we've
                                            // got an action which stands on its own.
                                            let precedingStr = this.matched[this.matched.length - this.match.length - 1];

                                            let atSOL = (!precedingStr /* @ Start Of File */ || precedingStr === '\n');

                                            this.pushState('action');
                                            // push the parsed '%include' back into the input-to-parse
                                            // to trigger the `<action>` state to re-parse it
                                            // and issue the desired follow-up token: 'INCLUDE':
                                            this.unput(yytext);

                                            // and allow the next lexer round to match and execute the suitable lexer rule(s) to parse this incoming action code block.
                                            if (atSOL) {
                                                return 'ACTION_START_AT_SOL';
                                            }
                                            return 'ACTION_START';
                                        %}

<INITIAL,rules,code>"%"{NAME}([^\r\n]*)
                                        %{
                                            /* ignore unrecognized decl */
                                            this.warn(rmCommonWS`
                                                ignoring unsupported lexer option ${dquote(yytext)}
                                                while lexing in ${dquote(this.topState())} state.

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            yytext = {
                                                name: this.matches[1],              // {NAME}
                                                value: this.matches[2].trim()       // optional value/parameters
                                            };
                                            return 'UNKNOWN_DECL';
                                        %}

"%%"                                    this.pushState('rules');
                                        return '%%';

"{"\d+(","\s*\d+|",")?"}"               return 'RANGE_REGEX';
"{"{ID}"}"                              return 'NAME_BRACE';
<set,options>"{"{ID}"}"                 return 'NAME_BRACE';
"{"                                     return '{';
"}"                                     return '}';

//===================== <set> section start =============================
<set>{

// We don't bother decoding escaped characters inside a regex [...] set as those will
// be converted anyway (and without any fuss) once we feed the regex into a XRegExp
// instance in the engine.
// The only thing we must bother about is the user using NAME_BRACE macro expansions
// inside a regex [...] set, hence the special exclusion of '{' here:
(?:"\\"[^{BR}]|[^\]\{{BR}])+            return 'REGEX_SET';
"{"                                     return 'REGEX_SET';
"]"                                     this.popState();
                                        return 'REGEX_SET_END';

{BR}                                    %{
                                            this.popState();
                                            this.unput(yytext);
                                            yyerror(rmCommonWS`
                                                regex [...] sets cannot span multiple lines.

                                                If you want a CR/LF to be part of a regex set, you can simply
                                                specify those as character escapes '\\r' and '\\n'.

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            return 'UNTERMINATED_REGEX_SET';
                                        %}
<<EOF>>                                 this.popState();
                                        yyerror(rmCommonWS`
                                            The regex [...] set has not been properly terminated by ']'.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_REGEX_SET';

}
//===================== <set> section end =============================

// in the trailing CODE block, only accept these `%include` macros when
// they appear at the start of a line and make sure the rest of lexer
// regexes account for this one so it'll match that way only:
<code>(?:[^%{BR}][^{BR}]*{BR}+)+        return 'TRAILING_CODE_CHUNK';      // shortcut to grab a large bite at once when we're sure not to encounter any `%include` in there at start-of-line.
<code>[^{BR}]*{BR}+                     return 'TRAILING_CODE_CHUNK';
<code>[^{BR}]+                          return 'TRAILING_CODE_CHUNK';      // the bit of CODE just before EOF...


// detect and report unterminated string constants ASAP
// for 'action', 'options', but also for other lexer conditions:
//
// these error catching rules fix https://github.com/GerHobbelt/jison/issues/13
<action>\"                              yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';
<action>\'                              yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';
<action>\`                              yyerror(rmCommonWS`
                                            unterminated string constant in lexer rule action block.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';

<options>\"                             yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';
<options>\'                             yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';
<options>\`                             yyerror(rmCommonWS`
                                            unterminated string constant in %options entry.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';

<*>\"                                   let rules = (this.topState() === 'macro' ? 'macro\'s' : this.topState());
                                        yyerror(rmCommonWS`
                                            unterminated string constant encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';
<*>\'                                   let rules = (this.topState() === 'macro' ? 'macro\'s' : this.topState());
                                        yyerror(rmCommonWS`
                                            unterminated string constant encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';
<*>\`                                   let rules = (this.topState() === 'macro' ? 'macro\'s' : this.topState());
                                        yyerror(rmCommonWS`
                                            unterminated string constant encountered while lexing
                                            ${rules}.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'UNTERMINATED_STRING_ERROR';


<macro,rules>.                          /* b0rk on bad characters */
                                        let rules = (this.topState() === 'macro' ? 'macro\'s' : this.topState());
                                        yyerror(rmCommonWS`
                                            unsupported lexer input encountered while lexing
                                            ${rules} (i.e. jison lex regexes) in ${dquote(this.topState())} state.

                                            NOTE: When you want this input to be interpreted as a LITERAL part
                                                  of a lex rule regex, you MUST enclose it in double or
                                                  single quotes.

                                                  If not, then know that this input is not accepted as a valid
                                                  regex expression here in jison-lex ${rules}.

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'error';

<options>.                              yyerror(rmCommonWS`
                                            unsupported lexer input: ${dquote(yytext)}
                                            while lexing in ${dquote(this.topState())} state.

                                            If this input was intentional, you might want to put quotes around
                                            it; any JavaScript string quoting style is accepted (single quotes,
                                            double quotes *or* backtick quotes a la ES6 string templates).

                                              Erroneous area:
                                            ${this.prettyPrintRange(yylloc)}
                                        `);
                                        return 'error';

<*>.                                    %{
                                            /* b0rk on bad characters */
                                            yyerror(rmCommonWS`
                                                unsupported lexer input: ${dquote(yytext)}
                                                while lexing in ${dquote(this.topState())} state.

                                                  Erroneous area:
                                                ${this.prettyPrintRange(yylloc)}
                                            `);
                                            return 'error';
                                        %}

<*><<EOF>>                              return 'EOF';

%%


const rmCommonWS = helpers.rmCommonWS;
const dquote     = helpers.dquote;
const scanRegExp = helpers.scanRegExp;










lexer.warn = function l_warn() {
    if (this.yy && this.yy.parser && typeof this.yy.parser.warn === 'function') {
        return this.yy.parser.warn.apply(this, arguments);
    } else {
        console.warn.apply(console, arguments);
    }
};

lexer.log = function l_log() {
    if (this.yy && this.yy.parser && typeof this.yy.parser.log === 'function') {
        return this.yy.parser.log.apply(this, arguments);
    } else {
        console.log.apply(console, arguments);
    }
};
