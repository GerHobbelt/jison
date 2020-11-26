
%code imports %{
  import XRegExp from '@gerhobbelt/xregexp';        // for helping out the `%options xregexp` in the lexer
  import JSON5 from '@gerhobbelt/json5';            // TODO: quick fix until `%code imports` works in the lexer spec!
  import helpers from '../helpers-lib';
  import fs from 'fs';
  import path from 'path';
%}



%start lex

/* Jison lexer file format grammar */

%nonassoc '/' '/!'

%left '*' '+' '?' RANGE_REGEX
%left '|'
%left '('

%token NAME_BRACE  "macro name in '{...}' curly braces"

%ebnf



%%


%{
    const OPTION_DOES_NOT_ACCEPT_VALUE = 0x0001;
    const OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES = 0x0002;
    const OPTION_ACCEPTS_000_IDENTIFIER_NAMES = 0x0004;    
    // ^^^ extension of OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES: '8bit', etc. is a 'legal' identifier now too, but '42' (pure number) is not!
    const OPTION_ALSO_ACCEPTS_STAR_AS_IDENTIFIER_NAME = 0x0008;
    const OPTION_DOES_NOT_ACCEPT_MULTIPLE_OPTIONS = 0x0010;
    const OPTION_DOES_NOT_ACCEPT_COMMA_SEPARATED_OPTIONS = 0x0020;
%}


lex
    : init definitions rules_and_epilogue EOF
        {
          $$ = Object.assign($rules_and_epilogue, $definitions);

          // if there are any options, add them all, otherwise set options to NULL:
          // can't check for 'empty object' by `if (yy.options) ...` so we do it this way:
          for (let key in yy.options) {
            $$.options = yy.options;
            break;
          }

          if (yy.actionInclude) {
            let asrc = yy.actionInclude.join('\n\n');
            // Only a non-empty action code chunk should actually make it through:
            if (asrc.trim() !== '') {
              $$.actionInclude = asrc;
            }
          }

          delete yy.options;
          delete yy.actionInclude;
          return $$;
        }
    ;

rules_and_epilogue
    : start_productions_marker rules epilogue
        {
            if ($epilogue) {
                $$ = { rules: $rules, moduleInclude: $epilogue };
            } else {
                $$ = { rules: $rules };
            }
            yy.popContext('Line 76');
        }
    | start_productions_marker error epilogue
        {
            yyerror(rmCommonWS`
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
                ${yylexer.prettyPrintRange(@error)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 99');
            $$ = { rules: [] };
        }
    | start_productions_marker DUMMY error
        {
            yyerror(rmCommonWS`
                There's probably an error in one or more of your lexer regex rules.
                There's an error in your lexer regex rules section.
                Maybe you did not correctly separate the lexer sections with
                a '%%' on an otherwise empty line? Did you correctly
                delimit every rule's action code block?
                The lexer spec file should have this structure:

                    definitions
                    %%
                    rules
                    %%                  // <-- only needed if ...
                    extra_module_code   // <-- ... epilogue is present.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 124');
            $$ = { rules: [] };
        }
    | ε
        /* Note: an empty rules set is allowed when you are setting up an `%options custom_lexer` */
        {
            $$ = { rules: [] };
        }
    ;

// because JISON doesn't support mid-rule actions,
// we set up `yy` using this empty rule at the start:
init
    : ε
        {
            yy.actionInclude = [];
            if (!yy.options) yy.options = {};

            // Store the `%s` and `%x` condition states in `yy` to ensure the rules section of the
            // lex language parser can reach these and use them for validating whether the lexer
            // rules written by the user actually reference *known* condition states.
            yy.startConditions = {};            // hash table

            // The next attribute + API set is a 'lexer/parser hack' in the sense that
            // it assumes zero look-ahead at some points during the parse
            // when a parser rule production's action code pushes or pops a value
            // on/off the context description stack to help the lexer produce
            // better informing error messages in case of a subsequent lexer
            // fail.
            yy.__options_flags__ = 0;
            yy.__options_category_description__ = '???';
            yy.__inside_scoped_ruleset__ = false;

            yy.__context_cfg_stack__ = [];

            yy.pushContext = function () {
                yy.__context_cfg_stack__.push({
                    flags: yy.__options_flags__,
                    descr: yy.__options_category_description__,
                    scoped: yy.__inside_scoped_ruleset__,
                });
            };
            yy.popContext = function (msg) {
                if (yy.__context_cfg_stack__.length >= 1) {
                    let r = yy.__context_cfg_stack__.pop();

                    yy.__options_flags__ = r.flags;
                    yy.__options_category_description__ = r.descr;
                    yy.__inside_scoped_ruleset__ = r.scoped;
                } else {
                    yyerror('__context_cfg_stack__ stack depleted! Contact a developer! ' + msg);
                }
            };
            yy.getContextDepth = function () {
                return yy.__context_cfg_stack__.length;
            };
            yy.restoreContextDepth = function (depth) {
                if (depth > yy.__context_cfg_stack__.length) {
                    yyerror(`__context_cfg_stack__ stack CANNOT be reset to depth ${depth} as it is too shallow already: actual depth is ${yy.__context_cfg_stack__.length}. Contact a developer!`);
                } else {
                    yy.__context_cfg_stack__.length = depth;
                }
            };
        }
    ;

definitions
    : definitions definition
        {
            $$ = $definitions;
            if ($definition) {
                switch ($definition.type) {
                case 'macro':
                    $$.macros[$definition.name] = $definition.body;
                    break;

                case 'names':
                    let condition_defs = $definition.names;
                    for (let i = 0, len = condition_defs.length; i < len; i++) {
                        let name = condition_defs[i][0];
                        if (name in $$.startConditions && $$.startConditions[name] !== condition_defs[i][1]) {
                            yyerror(rmCommonWS`
                                You have specified the lexer condition state '${name}' as both
                                EXCLUSIVE ('%x') and INCLUSIVE ('%s'). Pick one, please, e.g.:

                                    %x ${name}
                                    %%
                                    <${name}>LEXER_RULE_REGEX    return 'TOK';

                                  Erroneous code:
                                ${yylexer.prettyPrintRange(@definition, @1)}
                            `);
                        }
                        $$.startConditions[name] = condition_defs[i][1];     // flag as 'exclusive'/'inclusive'
                    }

                    // and update the `yy.startConditions` hash table as well, so we have a full set
                    // by the time this parser arrives at the lexer rules in the input-to-parse:
                    yy.startConditions = $$.startConditions;
                    break;

                case 'unknown':
                    $$.unknownDecls.push($definition.body);
                    break;

                case 'imports':
                    $$.importDecls.push($definition.body);
                    break;

                case 'codeSection':
                    $$.codeSections.push($definition.body);
                    break;

                default:
                    yyerror(rmCommonWS`
                      Encountered an unsupported definition type: ${$definition.type}.

                        Erroneous area:
                      ${yylexer.prettyPrintRange(@definition)}
                    `);
                    break;
                }
            }
        }
    | ε
        {
          $$ = {
            macros: {},           // { hash table }
            startConditions: {},  // { hash table }
            codeSections: [],     // [ array of {qualifier,include} pairs ]
            importDecls: [],      // [ array of {name,path} pairs ]
            unknownDecls: []      // [ array of {name,value} pairs ]
          };
        }
    ;

definition
    //
    // may be a *macro definition*, e.g.
    //
    //     HEX_NUMBER                              "0"[xX][0-9a-fA-F]+
    //
    : MACRO_NAME regex MACRO_END
        {
            // Note: make sure we don't try re-define/override any XRegExp `\p{...}` or `\P{...}`
            // macros here:
            if (XRegExp._getUnicodeProperty($MACRO_NAME)) {
                // Work-around so that you can use `\p{ascii}` for a XRegExp slug, a.k.a.
                // Unicode 'General Category' Property cf. http://unicode.org/reports/tr18/#Categories,
                // while using `\p{ASCII}` as a *macro expansion* of the `ASCII`
                // macro:
                if ($MACRO_NAME.toUpperCase() !== $MACRO_NAME) {
                    yyerror(rmCommonWS`
                      Cannot use name "${$MACRO_NAME}" as a macro name
                      as it clashes with the same XRegExp "\\p{..}" Unicode \'General Category\'
                      Property name.
                      Use all-uppercase macro names, e.g. name your macro
                      "${$MACRO_NAME.toUpperCase()}" to work around this issue
                      or give your offending macro a different name.

                        Erroneous area:
                      ${yylexer.prettyPrintRange(@MACRO_NAME)}
                    `);
                }
            }

            $$ = {
                type: 'macro',
                name: $MACRO_NAME,
                body: $regex
            };
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | MACRO_NAME error
        {
            yyerror(rmCommonWS`
                ill defined macro definition.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @MACRO_NAME)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = null;
        }
    //
    // may be an *inclusive lexer condition* set specification, e.g.
    //
    //     %s rules macro
    //
    | start_inclusive_keyword option_list OPTIONS_END
        {
            let lst = $option_list;
            for (let i = 0, len = lst.length; i < len; i++) {
                lst[i][1] = 0;     // flag as 'inclusive'
            }

            yy.popContext('Line 325');

            $$ = {
                type: 'names',
                names: lst         // 'inclusive' conditions have value 0, 'exclusive' conditions have value 1
            };
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | start_inclusive_keyword error
        {
            yyerror(rmCommonWS`
                ill defined '%s' inclusive lexer condition set specification.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @start_inclusive_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 347');
            $$ = null;
        }
    //
    // may be an *exclusive lexer condition* set specification, e.g.
    //
    //     %x code options action set
    //
    | start_exclusive_keyword option_list OPTIONS_END
        {
            let lst = $option_list;
            for (let i = 0, len = lst.length; i < len; i++) {
                lst[i][1] = 1;     // flag as 'exclusive'
            }

            yy.popContext('Line 362');

            $$ = {
                type: 'names',
                names: lst         // 'inclusive' conditions have value 0, 'exclusive' conditions have value 1
            };
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | start_exclusive_keyword error
        {
            yyerror(rmCommonWS`
                ill defined '%x' exclusive lexer condition set specification.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @start_exclusive_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 384');
            $$ = null;
        }
    //
    // may be a *lexer setup code section*, e.g.
    //
    //     %{
    //        console.log('setup info message');
    //     %}
    //
    // **Note** that the action block start marker `%{` MUST be positioned
    // at the start of a line to be accepted; indented action code blocks
    // are always related to a preceding lexer spec item, such as a
    // lexer match rule expression (see 'lexer rules').
    //
    | ACTION_START_AT_SOL action ACTION_END
        {
            let srcCode = trimActionCode($action + $ACTION_END, {
                startMarker: $ACTION_START_AT_SOL
            });
            if (srcCode) {
                let rv = checkActionBlock(srcCode, @action, yy);
                if (rv) {
                    yyerror(rmCommonWS`
                        The '%{...%}' lexer setup action code section does not compile: ${rv}

                          Erroneous area:
                        ${yylexer.prettyPrintRange(@action, @ACTION_START_AT_SOL)}
                    `);
                }
                yy.actionInclude.push(srcCode);
            }
            $$ = null;
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | UNTERMINATED_ACTION_BLOCK
        %{
            // The issue has already been reported by the lexer. No need to repeat
            // ourselves with another error report from here.
            $$ = null;
        %}
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | ACTION_START_AT_SOL error
        %{
            yyerror(rmCommonWS`
                There's very probably a problem with this '%{...%\}' lexer setup action code section.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@ACTION_START_AT_SOL)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = null;
        %}
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    // This rule detects the presence of an unattached *indented*
    // action code block.
    //
    | ACTION_START error
        %{
            let start_marker = $ACTION_START.trim();
            let marker_msg = (start_marker ? ' or similar, such as ' + start_marker : '');
            yyerror(rmCommonWS`
                The '%{...%\}' lexer setup action code section MUST have its action
                block start marker (\`%{\`${marker_msg}) positioned
                at the start of a line to be accepted: *indented* action code blocks
                (such as this one) are always related to an immediately preceding lexer spec item,
                e.g. a lexer match rule expression (see 'lexer rules').

                  Erroneous area:
                ${yylexer.prettyPrintRange(@ACTION_START)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = null;
        %}
    //
    // may be an `%options` statement, e.g.
    //
    //     %options easy_keyword_rules xregexp
    //
    | option_keyword option_list OPTIONS_END
        {
            let lst = $option_list;
			// Apply the %option to the current lexing process immediately, as it MAY
			// impact the lexer's behaviour, e.g. `%option do-not-test-compile`
            for (let i = 0, len = lst.length; i < len; i++) {
                yy.options[lst[i][0]] = lst[i][1];
            }
            yy.popContext('Line 484');
            $$ = null;
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | option_keyword error OPTIONS_END
        {
            yyerror(rmCommonWS`
                ill defined '${$option_keyword} line.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @option_keyword, @OPTIONS_END)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 502');
            $$ = null;
        }
    | option_keyword error
        {
            // TODO ...
            yyerror(rmCommonWS`
                ${$option_keyword} don't seem terminated?

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @option_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 517');
            $$ = null;
        }
    | UNKNOWN_DECL
        {
            $$ = {
                type: 'unknown',
                body: $1
            };
        }
    | import_keyword option_list OPTIONS_END
        {
            // check if there are two unvalued options: 'name path'
            let lst = $option_list;
            let len = lst.length;
            let body;
            if (len === 2 && lst[0][1] === true && lst[1][1] === true) {
                // `name path`:
                body = {
                    name: lst[0][0],
                    path: lst[1][0]
                };
            } else if (len <= 2) {
                yyerror(rmCommonWS`
                    You did not specify a legal qualifier name and/or file path for the '%import' statement, which must have the format:
                        %import qualifier_name file_path

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@option_list, @import_keyword)}
                `);
            } else {
                yyerror(rmCommonWS`
                    You did specify too many attributes for the '%import' statement, which must have the format:
                        %import qualifier_name file_path

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@option_list, @import_keyword)}
                `);
            }

            yy.popContext('Line 557');

            $$ = {
                type: 'imports',
                body: body
            };
        }
    | import_keyword error OPTIONS_END
        {
            yyerror(rmCommonWS`
                %import name or source filename missing maybe?

                Note: each '%import' must be qualified by a name, e.g. 'required' before the import path itself:
                    %import qualifier_name file_path

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @import_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 578');
            $$ = null;
        }
    | init_code_keyword option_list ACTION_START action ACTION_END OPTIONS_END
        {
            // check there's only 1 option which is an identifier
            let lst = $option_list;
            let len = lst.length;
            let name;
            if (len === 1 && lst[0][1] === true) {
                // `name`:
                name = lst[0][0];
            } else if (len <= 1) {
                yyerror(rmCommonWS`
                    You did not specify a legal qualifier name for the '%code' initialization code statement, which must have the format:
                        %code qualifier_name %{...code...%}

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@option_list, @init_code_keyword)}
                `);
            } else {
                yyerror(rmCommonWS`
                    You did specify too many attributes for the '%code' initialization code statement, which must have the format:
                        %code qualifier_name %{...code...%}

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@option_list, @init_code_keyword)}
                `);
            }

            let srcCode = trimActionCode($action + $ACTION_END, {
                startMarker: $ACTION_START
            });
            let rv = checkActionBlock(srcCode, @action, yy);
            if (rv) {
                yyerror(rmCommonWS`
                    The '%code ${name}' initialization section's action code block does not compile: ${rv}

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@action, @init_code_keyword)}
                `);
            }

            yy.popContext('Line 621');

            $$ = {
                type: 'codeSection',
                body: {
                  qualifier: name,
                  include: srcCode
                }
            };
        }
    | init_code_keyword option_list ACTION_START error OPTIONS_END
        {
            let start_marker = $ACTION_START.trim();
            let marker_msg = (start_marker ? ' or similar, such as ' + start_marker : '');
            let end_marker_msg = marker_msg.replace(/\{/g, '}');
            yyerror(rmCommonWS`
                The '%code ID %{...%\}' initialization code section must be properly
                wrapped in block start markers (\`%{\`${marker_msg})
                and matching end markers (\`%}\`${end_marker_msg}). Expected format:

                    %code qualifier_name {action code}

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @init_code_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 649');
            $$ = null;
        }
    | init_code_keyword error ACTION_START /* ...action */ error OPTIONS_END
        {
            yyerror(rmCommonWS`
                Each '%code' initialization code section must be qualified by a name,
                e.g. 'required' before the action code itself:

                    %code qualifier_name {action code}

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error1, @init_code_keyword)}

                  Technical error report:
                ${$error1.errStr}
            `);
            yy.popContext('Line 666');
            $$ = null;
        }
    | init_code_keyword error OPTIONS_END
        {
            yyerror(rmCommonWS`
                Each '%code' initialization code section must be qualified by a name,
                e.g. 'required' before the action code itself.

                The '%code ID %{...%\}' initialization code section must be properly
                wrapped in block start markers (e.g. \`%{\`) and matching end markers
                (e.g. \`%}\`). Expected format:

                    %code qualifier_name {action code}

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @init_code_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 687');
            $$ = null;
        }
    | error
        {
            yyerror(rmCommonWS`
                illegal input in the lexer spec definitions section.

                This might be stuff incorrectly dangling off the previous
                '${yy.__options_category_description__}' definition statement, so please do check above
                when the mistake isn't immediately obvious from this error spot itself.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @-1)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = null;
        }
    ;

option_keyword
    : OPTIONS
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES | OPTION_ACCEPTS_000_IDENTIFIER_NAMES;
            yy.__options_category_description__ = $OPTIONS;
        }
    ;

import_keyword
    : IMPORT
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_DOES_NOT_ACCEPT_VALUE | OPTION_DOES_NOT_ACCEPT_COMMA_SEPARATED_OPTIONS;
            yy.__options_category_description__ = $IMPORT;
        }
    ;

init_code_keyword
    : INIT_CODE
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_DOES_NOT_ACCEPT_VALUE | OPTION_DOES_NOT_ACCEPT_MULTIPLE_OPTIONS | OPTION_DOES_NOT_ACCEPT_COMMA_SEPARATED_OPTIONS;
            yy.__options_category_description__ = $INIT_CODE;
        }
    ;

include_keyword
    : INCLUDE
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_DOES_NOT_ACCEPT_VALUE | OPTION_DOES_NOT_ACCEPT_COMMA_SEPARATED_OPTIONS;
            yy.__options_category_description__ = $INCLUDE;
        }
    ;

start_inclusive_keyword
    : START_INC
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_DOES_NOT_ACCEPT_VALUE | OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES;
            yy.__options_category_description__ = 'the inclusive lexer start conditions set (%s)';
        }
    ;

start_exclusive_keyword
    : START_EXC
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_DOES_NOT_ACCEPT_VALUE | OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES;
            yy.__options_category_description__ = 'the exclusive lexer start conditions set (%x)';
        }
    ;

start_conditions_marker
    : '<'
        {
            yy.pushContext();
            yy.__options_flags__ = OPTION_DOES_NOT_ACCEPT_VALUE | OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES | OPTION_ALSO_ACCEPTS_STAR_AS_IDENTIFIER_NAME;
            yy.__options_category_description__ = 'the <...> delimited set of lexer start conditions';
        }
    ;

start_productions_marker
    : '%%'
        {
            yy.pushContext();
            yy.__options_flags__ = 0;
            yy.__options_category_description__ = 'the lexer rules definition section';
        }
    ;

start_epilogue_marker
    : '%%'
        {
            yy.pushContext();
            yy.__options_flags__ = 0;
            yy.__options_category_description__ = 'the lexer epilogue section';
        }
    ;

rules
    : rules scoped_rules_collective
        {
            if ($scoped_rules_collective) {
                $$ = $rules.concat($scoped_rules_collective);
            } else {
                $$ = $rules;
            }
        }
    | rules rule
        {
            if ($rule) {
                $$ = $rules.concat([$rule]);
            } else {
                $$ = $rules;
            }
        }
    | ε
        { $$ = []; }
    ;

scoped_rules_collective
    : start_conditions rule
        {
            if ($start_conditions) {
                $rule.unshift($start_conditions);
            }

            yy.popContext('Line 818');

            $$ = [$rule];
        }
    | start_conditions '{' rule_block '}'
        {
            if ($start_conditions) {
                $rule_block.forEach(function (d) {
                    d.unshift($start_conditions);
                });
            }

            yy.popContext('Line 830');

            $$ = $rule_block;
        }
    | start_conditions '{' error '}'[sentinel]
        {
            yyerror(rmCommonWS`
                Seems you made a mistake while specifying one of the lexer rules inside
                the start condition
                   <${$start_conditions.join(',')}> { rules... }
                block.

                  Erroneous area:
                ${yylexer.prettyPrintRange(yyparser.mergeLocationInfo(##start_conditions, ##sentinel), @start_conditions)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 848');
            $$ = null;
        }
    | start_conditions '{' error
        {
            yyerror(rmCommonWS`
                Seems you did not correctly bracket a lexer rules set inside
                the start condition
                  <${$start_conditions.join(',')}> { rules... }
                as a terminating curly brace '}' could not be found.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @start_conditions)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 865');
            $$ = null;
        }
    | start_conditions error '}'
        {
            yyerror(rmCommonWS`
                Seems you did not correctly bracket a lexer rules set inside
                the start condition
                  <${$start_conditions.join(',')}> { rules... }
                as a terminating curly brace '}' could not be found.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @start_conditions)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 882');
            $$ = null;
        }
    ;

rule_block
    : rule_block rule
        {
            $$ = $rule_block;
            if ($rule) {
                $$.push($rule);
            }
        }
    | ε
        { $$ = []; }
    ;

rule
    : regex ACTION_START action ACTION_END
        {
            let srcCode = trimActionCode($action + $ACTION_END, {
                startMarker: $ACTION_START
            });
            let rv = checkActionBlock(srcCode, @action, yy);
            if (rv) {
                yyerror(rmCommonWS`
                    The lexer rule's action code section does not compile: ${rv}

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@action, @regex)}
                `);
            }
            $$ = [$regex, srcCode];
        }
    | regex ACTION_START_AT_SOL action ACTION_END
        {
            let srcCode = trimActionCode($action + $ACTION_END, {
                startMarker: $ACTION_START_AT_SOL
            });
            let rv = checkActionBlock(srcCode, @action, yy);
            if (rv) {
                yyerror(rmCommonWS`
                    The lexer rule's action code section does not compile: ${rv}

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@action, @regex)}
                `);
            }
            $$ = [$regex, srcCode];
        }
    | regex ARROW_ACTION_START action ACTION_END
        {
            let srcCode = trimActionCode($action + $ACTION_END, {
                dontTrimSurroundingCurlyBraces: true
            });
            // add braces around ARROW_ACTION_CODE so that the action chunk test/compiler
            // will uncover any illegal action code following the arrow operator, e.g.
            // multiple statements separated by semicolon.
            //
            // Note/Optimization:
            // there's no need for braces in the generated expression when we can
            // already see the given action is an identifier string or something else
            // that's a sure simple thing for a JavaScript `return` statement to carry.
            // By doing this, we simplify the token return replacement code replacement
            // process which will be applied to the parsed lexer before its code
            // will be generated by JISON.
            srcCode = 'return ' + braceArrowActionCode(srcCode);

            let rv = checkActionBlock(srcCode, @action, yy);
            if (rv) {
                let indentedSrc = rmCommonWS([srcCode]).split('\n').join('\n    ');

                yyerror(rmCommonWS`
                    The lexer rule's 'arrow' action code section does not compile: ${rv}

                    # NOTE that the arrow action automatically wraps the action code
                    # in a \`return (...);\` statement to prevent hard-to-diagnose run-time
                    # errors down the line.
                    #
                    # Please be aware that the reported compile error MAY be referring
                    # to the wrapper code which is added by JISON automatically when
                    # processing arrow actions: the entire action code chunk
                    # (including wrapper) is:

                        ${indentedSrc}

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@action, @regex)}
                `);
            }

            $$ = [$regex, srcCode];
        }
    | regex ARROW_ACTION_START error
        {
            $$ = [$regex, $error];
            yyerror(rmCommonWS`
                A lexer rule action arrow must be followed by a single JavaScript expression specifying the lexer token to produce, e.g.:

                    /rule/   -> 'BUGGABOO'

                which is equivalent to:

                    /rule/      %{ return 'BUGGABOO'; %}

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @regex)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    | regex ACTION_START error /* ACTION_END */
        {
            // TODO: REWRITE
            $$ = [$regex, $error];
            yyerror(rmCommonWS`
                A lexer rule regex action code must be properly terminated and must contain a JavaScript statement block (or anything that does parse as such), e.g.:

                    /rule/      %{ invokeHooHaw(); return 'TOKEN'; %}

                NOTE: when you have very simple action code, wrapping it in '%{...}%' or equivalent is not required as long as you keep the code indented, e.g.:

                    /rule/      invokeHooHaw();
                                return 'TOKEN';

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @regex)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    | regex ACTION_START_AT_SOL error /* ACTION_END */
        {
            // TODO: REWRITE
            $$ = [$regex, $error];
            yyerror(rmCommonWS`
                A lexer rule regex action code must be properly terminated and must contain a JavaScript statement block (or anything that does parse as such), e.g.:

                    /rule/
                    %{
                        invokeHooHaw();
                        return 'TOKEN';
                    %}

                You may indent the initial '%{' to disambiguate this as being a rule action code block instead of a lexer init code block:

                    /rule/
                      %{
                        invokeHooHaw();
                        return 'TOKEN';
                    %}

                You can also accomplish this by placing the '%{' on the same line as the regex:

                    /rule/      %{
                        invokeHooHaw();
                        return 'TOKEN';
                    %}

                NOTE: when you have very simple action code, wrapping it in '%{...}%' or equivalent is not required as long as you keep the code indented, e.g.:

                    /rule/      invokeHooHaw();
                                return 'TOKEN';

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @regex)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    | regex error
        {
            $$ = [$regex, $error];
            yyerror(rmCommonWS`
                Lexer rule regex action code declaration error?

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @regex)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    // ---------------------------------------------------------------------------------
    // ---- additional chunks one MAY encounter *instead* of a regular lexer rule: -----
    // ---------------------------------------------------------------------------------
    //
    // may be a *lexer setup code section*, e.g.
    //
    //     %{
    //        console.log('setup info message');
    //     %}
    //
    // **Note** that the action block start marker `%{` MUST be positioned
    // at the start of a line to be accepted; indented action code blocks
    // are always related to a preceding lexer spec item, such as a
    // lexer match rule expression (see 'lexer rules').
    //
    | ACTION_START_AT_SOL action ACTION_END
        {
            if (yy.__inside_scoped_ruleset__) {
                yyerror(rmCommonWS`
                    '%{...%}' lexer setup action code sections are not accepted inside
                    '<...>{ ... }' scoped rule blocks. Move this action code to the top
                    of the '%%' section instead.

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@$)}
                `);
            } else {
                let srcCode = trimActionCode($action + $ACTION_END, {
                    startMarker: $ACTION_START_AT_SOL
                });
                if (srcCode) {
                    let rv = checkActionBlock(srcCode, @action, yy);
                    if (rv) {
                        yyerror(rmCommonWS`
                            The '%{...%}' lexer setup action code section does not compile: ${rv}

                              Erroneous area:
                            ${yylexer.prettyPrintRange(@action, @ACTION_START_AT_SOL)}
                        `);
                    }
                    yy.actionInclude.push(srcCode);
                }
            }
            $$ = null;
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | UNTERMINATED_ACTION_BLOCK
        %{
            // The issue has already been reported by the lexer. No need to repeat
            // ourselves with another error report from here.
            $$ = null;
        %}
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | ACTION_START_AT_SOL error
        %{
            let start_marker = $ACTION_START_AT_SOL.trim();
            let marker_msg = (start_marker ? ' or similar, such as ' + start_marker : '');
            yyerror(rmCommonWS`
                There's very probably a problem with this '%{...%\}' lexer setup action code section.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@ACTION_START_AT_SOL)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = null;
        %}
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    // This rule detects the presence of an unattached *indented*
    // action code block.
    //
    | ACTION_START error
        %{
            let start_marker = $ACTION_START.trim();
            // When the start_marker is not an explicit `%{`, `{` or similar, the error
            // is more probably due to indenting the rule regex, rather than an error
            // in writing the setup action code block:
            if (start_marker.indexOf('{') >= 0) {
                let marker_msg = (start_marker ? ' or similar, such as ' + start_marker : '');
                yyerror(rmCommonWS`
                    The '%{...%\}' lexer setup action code section MUST have its action
                    block start marker (\`%{\`${marker_msg}) positioned
                    at the start of a line to be accepted: *indented* action code blocks
                    (such as this one) are always related to an immediately preceding lexer spec item,
                    e.g. a lexer match rule expression (see 'lexer rules').

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@ACTION_START)}

                      Technical error report:
                    ${$error.errStr}
                `);
            } else {
                yyerror(rmCommonWS`
                    There's probably an error in one or more of your lexer regex rules.
                    Did you perhaps indent the rule regex? Note that all rule regexes
                    MUST start at the start of the line, i.e. text column 1. Indented text
                    is perceived as JavaScript action code related to the last lexer
                    rule regex.

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@error)}

                      Technical error report:
                    ${$error.errStr}
                `);
            }
            $$ = null;
        %}
    | start_inclusive_keyword
        {
            yyerror(rmCommonWS`
                \`${yy.__options_category_description__}\` statements must be placed in
                the top section of the lexer spec file, above the first '%%'
                separator. You cannot specify any in the second section as has been
                done here.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@start_inclusive_keyword)}
            `);
            yy.popContext('Line 1198');
            $$ = null;
        }
    | start_exclusive_keyword
        {
            yyerror(rmCommonWS`
                \`${yy.__options_category_description__}\` statements must be placed in
                the top section of the lexer spec file, above the first '%%'
                separator. You cannot specify any in the second section as has been
                done here.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@start_exclusive_keyword)}
            `);
            yy.popContext('Line 1212');
            $$ = null;
        }
    | option_keyword
        {
            yyerror(rmCommonWS`
                \`${yy.__options_category_description__}\` statements must be placed in
                the top section of the lexer spec file, above the first '%%'
                separator. You cannot specify any in the second section as has been
                done here.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@option_keyword)}
            `);
            yy.popContext('Line 1226');
            $$ = null;
        }
    | UNKNOWN_DECL
        {
            yyerror(rmCommonWS`
                \`${$UNKNOWN_DECL.name}\` statements must be placed in
                the top section of the lexer spec file, above the first '%%'
                separator. You cannot specify any in the second section as has been
                done here.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@UNKNOWN_DECL)}
            `);
            $$ = null;
        }
    | import_keyword
        {
            yyerror(rmCommonWS`
                \`${yy.__options_category_description__}\` statements must be placed in
                the top section of the lexer spec file, above the first '%%'
                separator. You cannot specify any in the second section as has been
                done here.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@import_keyword)}
            `);
            yy.popContext('Line 1253');
            $$ = null;
        }
    | init_code_keyword
        {
            yyerror(rmCommonWS`
                \`${yy.__options_category_description__}\` statements must be placed in
                the top section of the lexer spec file, above the first '%%'
                separator. You cannot specify any in the second section as has been
                done here.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@init_code_keyword)}
            `);
            yy.popContext('Line 1267');
            $$ = null;
        }
    ;

action
    : action ACTION_BODY
        { $$ = $action + $ACTION_BODY; }
    | action include_macro_code
        { $$ = $action + '\n\n' + $include_macro_code + '\n\n'; }
    | action INCLUDE_PLACEMENT_ERROR
        {
            yyerror(rmCommonWS`
                You may place the '%include' instruction only at the start/front of a line.

                  Its use is not permitted at this position:
                ${yylexer.prettyPrintRange(@INCLUDE_PLACEMENT_ERROR, @-1)}
            `);
            $$ = $action;
        }
    | action BRACKET_MISSING
        {
            yyerror(rmCommonWS`
                Missing curly braces: seems you did not correctly bracket a lexer rule action block in curly braces: '{ ... }'.

                  Offending action body:
                ${yylexer.prettyPrintRange(@BRACKET_MISSING, @-1)}
            `);
            $$ = $action;
        }
    | action BRACKET_SURPLUS
        {
            yyerror(rmCommonWS`
                Too many curly braces: seems you did not correctly bracket a lexer rule action block in curly braces: '{ ... }'.

                  Offending action body:
                ${yylexer.prettyPrintRange(@BRACKET_SURPLUS, @-1)}
            `);
            $$ = $action;
        }
    | action UNTERMINATED_STRING_ERROR
        {
            yyerror(rmCommonWS`
                Unterminated string constant in lexer rule action block.

                When your action code is as intended, it may help to enclose
                your rule action block code in a '%{...%}' block.

                  Offending action body:
                ${yylexer.prettyPrintRange(@UNTERMINATED_STRING_ERROR, @-1)}
            `);
            $$ = $action;
        }
    | ε
        { $$ = ''; }
    ;

start_conditions
    : start_conditions_marker option_list OPTIONS_END '>'[sentinel]
        {
            // rewrite + accept star '*' as name + check if we allow empty list?
            $$ = $option_list.map(function (el) {
                let name = el[0];

                // Validate the given condition state: when it isn't known, print an error message
                // accordingly:
                if (name !== '*' && name !== 'INITIAL' && !(name in yy.startConditions)) {
                    yyerror(rmCommonWS`
                        You specified an unknown lexer condition state '${name}'.
                        Is this a typo or did you forget to include this one in the '%s' and '%x'
                        inclusive and exclusive condition state sets specifications at the top of
                        the lexer spec?

                        As a rough example, things should look something like this in your lexer
                        spec file:

                            %s ${name}
                            %%
                            <${name}>LEXER_RULE_REGEX    return 'TOK';

                          Erroneous code:
                        ${yylexer.prettyPrintRange(@option_list, @1, @sentinel)}
                    `);
                }

                return name;
            });

            // Optimization: these two calls cancel one another out here:
            //
            // yy.popContext('Line 1357');
            // yy.pushContext();

            yy.__inside_scoped_ruleset__ = true;

            // '<' '*' '>'
            //    { $$ = ['*']; }
        }
    | start_conditions_marker option_list error
        {
            // rewrite + accept star '*' as name + check if we allow empty list?
            let lst = $option_list.map(function (el) {
                return el[0];
            });

            yyerror(rmCommonWS`
                Seems you did not correctly terminate the start condition set
                    <${lst.join(',')},???>
                with a terminating '>'

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @1)}

                  Technical error report:
                ${$error.errStr}
            `);

            // Optimization: these two calls cancel one another out here:
            //
            // yy.popContext('Line 1386');
            // yy.pushContext();

            yy.__inside_scoped_ruleset__ = true;

            $$= null;
        }
    ;

regex
    : nonempty_regex_list[re]
        {
          // Detect if the regex ends with a pure (Unicode) word;
          // we *do* consider escaped characters which are 'alphanumeric'
          // to be equivalent to their non-escaped version, hence these are
          // all valid 'words' for the 'easy keyword rules' option:
          //
          // - hello_kitty
          // - γεια_σου_γατούλα
          // - \u03B3\u03B5\u03B9\u03B1_\u03C3\u03BF\u03C5_\u03B3\u03B1\u03C4\u03BF\u03CD\u03BB\u03B1
          //
          // http://stackoverflow.com/questions/7885096/how-do-i-decode-a-string-with-escaped-unicode#12869914
          //
          // As we only check the *tail*, we also accept these as
          // 'easy keywords':
          //
          // - %options
          // - %foo-bar
          // - +++a:b:c1
          //
          // Note the dash in that last example: there the code will consider
          // `bar` to be the keyword, which is fine with us as we're only
          // interested in the trailing boundary and patching that one for
          // the `easy_keyword_rules` option.
          $$ = $re;
          if (yy.options.easy_keyword_rules) {
            // We need to 'protect' `eval` here as keywords are allowed
            // to contain double-quotes and other leading cruft.
            // `eval` *does* gobble some escapes (such as `\b`) but
            // we protect against that through a simple replace regex:
            // we're not interested in the special escapes' exact value
            // anyway.
            // It will also catch escaped escapes (`\\`), which are not
            // word characters either, so no need to worry about
            // `eval(str)` 'correctly' converting convoluted constructs
            // like '\\\\\\\\\\b' in here.
            $$ = $$
            .replace(/\\\\/g, '.')
            .replace(/"/g, '.')
            .replace(/\\c[A-Z]/g, '.')
            .replace(/\\[^xu0-7]/g, '.');

            try {
              // Convert Unicode escapes and other escapes to their literal characters
              // BEFORE we go and check whether this item is subject to the
              // `easy_keyword_rules` option.
              $$ = JSON.parse('"' + $$ + '"');
            }
            catch (ex) {
              yyparser.warn('easy-keyword-rule FAIL on eval: ', ex);

              // make the next keyword test fail:
              $$ = '.';
            }
            // a 'keyword' starts with an alphanumeric character,
            // followed by zero or more alphanumerics or digits:
            let re = new XRegExp('\\w[\\w\\d]*$');
            if (XRegExp.match($$, re)) {
              $$ = $re + "\\b";
            } else {
              $$ = $re;
            }
          }
        }
    ;

regex_list
    : nonempty_regex_list
        { $$ = $1; }
    | ε
        { $$ = ''; }
    ;

nonempty_regex_list
    : nonempty_regex_list '|' regex_concat
        { $$ = $1 + '|' + $3; }
    | nonempty_regex_list '|'
        { $$ = $1 + '|'; }
    | '|' regex_concat
        { $$ = '|' + $2; }
    | '|'                       // pathological empty regex combo, e.g. `(|)`
        { $$ = '|'; }
    | regex_concat
        { $$ = $1; }
    ;

regex_concat
    : regex_concat regex_base
        { $$ = $1 + $2; }
    | regex_base
        { $$ = $1; }
    ;

regex_base
    : '(' regex_list ')'
        { $$ = '(' + $regex_list + ')'; }
    | SPECIAL_GROUP regex_list ')'
        { $$ = $SPECIAL_GROUP + $regex_list + ')'; }
    | '(' regex_list error
        {
            yyerror(rmCommonWS`
                Seems you did not correctly bracket a lex rule regex part in '(...)' braces.

                  Unterminated regex part:
                ${yylexer.prettyPrintRange(@error, @1)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    | SPECIAL_GROUP regex_list error
        {
            yyerror(rmCommonWS`
                Seems you did not correctly bracket a lex rule regex part in '(...)' braces.

                  Unterminated regex part:
                ${yylexer.prettyPrintRange(@error, @SPECIAL_GROUP)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    | regex_base '+'
        { $$ = $regex_base + '+'; }
    | regex_base '*'
        { $$ = $regex_base + '*'; }
    | regex_base '?'
        { $$ = $regex_base + '?'; }
    | '/' regex_base
        { $$ = '(?=' + $regex_base + ')'; }
    | '/!' regex_base
        { $$ = '(?!' + $regex_base + ')'; }
    | name_expansion
    | regex_base range_regex
        { $$ = $1 + $2; }
    | any_group_regex
    | '.'
        { $$ = '.'; }
    | '^'
        { $$ = '^'; }
    | '$'
        { $$ = '$'; }
    | REGEX_SPECIAL_CHAR
    | literal_string
    | ESCAPED_CHAR
        { $$ = encodeRegexLiteralStr(encodeUnicodeCodepoint($ESCAPED_CHAR)); }
    ;

name_expansion
    : NAME_BRACE
        {
            $$ = $NAME_BRACE;
        }
    ;

any_group_regex
    : REGEX_SET_START regex_set REGEX_SET_END
        { $$ = $REGEX_SET_START + $regex_set + $REGEX_SET_END; }
    | REGEX_SET_START REGEX_SET_END
        {
            yyerror(rmCommonWS`
                Empty lex rule regex set '[]' is not legal.

                If you want to match ANY character (including CR/LF characters) you may
                write '[^]' or '[\s\S]', which are standard idioms for this in JavaScript.

                  Erroneous regex set:
                ${yylexer.prettyPrintRange(@REGEX_SET_END, @REGEX_SET_START)}
            `);
            $ = null;
        }
    | REGEX_SET_START regex_set? UNTERMINATED_REGEX_SET
        {
            yyerror(rmCommonWS`
                Seems you did not correctly bracket a lex rule regex set in '[...]' brackets.

                  Unterminated regex set:
                ${yylexer.prettyPrintRange(@UNTERMINATED_REGEX_SET, @REGEX_SET_START)}
            `);
            $ = null;
        }
    | REGEX_SET_START error
        {
            yyerror(rmCommonWS`
                Seems you did not correctly bracket a lex rule regex set in '[...]' brackets.

                  Unterminated regex set:
                ${yylexer.prettyPrintRange(@error, @REGEX_SET_START)}

                  Technical error report:
                ${$error.errStr}
            `);
        }
    ;

regex_set
    : regex_set regex_set_atom
        { $$ = $regex_set + $regex_set_atom; }
    | regex_set_atom
    ;

regex_set_atom
    : REGEX_SET
    | name_expansion
        {
            if (XRegExp._getUnicodeProperty($name_expansion.replace(/[{}]/g, ''))
                && $name_expansion.toUpperCase() !== $name_expansion
            ) {
                // treat this as part of an XRegExp `\p{...}` Unicode 'General Category' Property cf. http://unicode.org/reports/tr18/#Categories
                $$ = $name_expansion;
            } else {
                $$ = $name_expansion;
            }
            //yyparser.log("name expansion for: ", { name: $name_expansion, redux: $name_expansion.replace(/[{}]/g, ''), output: $$ });
        }
    ;

range_regex
    : RANGE_REGEX
        { $$ = $RANGE_REGEX; }
    ;

literal_string
    : STRING_LIT
        {
            let src = $STRING_LIT;
            let s = src.substring(1, src.length - 1);
            let edge = src[0];
            $$ = encodeRegexLiteralStr(s, edge);
        }
    | CHARACTER_LIT
        {
            let s = $CHARACTER_LIT;
            $$ = encodeRegexLiteralStr(s);
        }
    ;

option_list
    : option_list ','[comma] option
        {
            // validate that this is legal behaviour under the given circumstances, i.e. parser context:
            if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_MULTIPLE_OPTIONS) {
                yyerror(rmCommonWS`
                    You may only specify one name/argument in a ${yy.__options_category_description__} statement.

                      Erroneous area:
                    ${yylexer.prettyPrintRange(yylexer.deriveLocationInfo(@comma, @option), @-1)}
                `);
            }
            if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_COMMA_SEPARATED_OPTIONS) {
                let optlist = $option_list.map(function (opt) {
                    return opt[0];
                });
                optlist.push($option[0]);

                yyerror(rmCommonWS`
                    You may not separate entries in a ${yy.__options_category_description__} statement using commas.
                    Use whitespace instead, e.g.:

                        ${$-1} ${optlist.join(' ')} ...

                      Erroneous area:
                    ${yylexer.prettyPrintRange(yylexer.deriveLocationInfo(@comma, @option_list), @-1)}
                `);
            }
            $$ = $option_list;
            if ($option) {
                $$.push($option);
            }
        }
    | option_list option
        {
            // validate that this is legal behaviour under the given circumstances, i.e. parser context:
            if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_MULTIPLE_OPTIONS) {
                yyerror(rmCommonWS`
                    You may only specify one name/argument in a ${yy.__options_category_description__} statement.

                      Erroneous area:
                    ${yylexer.prettyPrintRange(yylexer.deriveLocationInfo(@option), @-1)}
                `);
            }
            $$ = $option_list;
            if ($option) {
                $$.push($option);
            }
        }
    | option
        {
            $$ = [];
            if ($option) {
                $$.push($option);
            }
        }
    | option_list ','[comma] error?[err] '=' option_value
        {
            let with_value_msg = ' (with optional value assignment)';
            if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_VALUE) {
                with_value_msg = '';
            }
            yyerror(rmCommonWS`
                Expected a valid option name${with_value_msg} in a ${yy.__options_category_description__} statement.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@err, @comma)}

                  Technical error report:
                ${$err ? $err.errStr : '---'}
            `);

            $$ = $option_list;
        }
    ;

option
    : option_name
        {
            $$ = [$option_name, true];
        }
    | option_name '=' option_value
        {
            // validate that this is legal behaviour under the given circumstances, i.e. parser context:
            if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_VALUE) {
                yyerror(rmCommonWS`
                    The entries in a ${yy.__options_category_description__} statement MUST NOT be assigned values, such as '${$option_name}=${$option_value}'.

                      Erroneous area:
                    ${yylexer.prettyPrintRange(yylexer.deriveLocationInfo(@option_value, @option_name), @-1)}
                `);
            }
            $$ = [$option_name, $option_value];
        }
    | option_name '=' error
        {
            // TODO ...
            yyerror(rmCommonWS`
                Internal error: option "${$option}" value assignment failure in a ${yy.__options_category_description__} statement.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@error, @-1)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = null;
        }
// WARNING: this production placed here will cause a LR(1) conflict, due to the options not necessarily being
// separated by ',' comma's, so it is ambiguous if 'option_name = option_value' should then be interpreted
// as a correct option *or* as a lone 'option_name' *plus* '%epsilon = option_value'.
//
// To resolve this conflict, we move this production to the 'option_list' where it MAY be applied when the
// option_list is comma-separated.
//
//    | error?[err] '=' option_value
//        {
//            let with_value_msg = ' (with optional value assignment)';
//            if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_VALUE) {
//                with_value_msg = '';
//            }
//            yyerror(rmCommonWS`
//                Expected a valid option name${with_value_msg} in a ${yy.__options_category_description__} statement.
//
//                  Erroneous area:
//                ${yylexer.prettyPrintRange(@err, @-1)}
//
//                  Technical error report:
//                ${$err.errStr}
//            `);
//        }
//        $$ = null;
    ;

option_name
    : option_value[name]
        {
            // validate that this is legal input under the given circumstances, i.e. parser context:
            if (yy.__options_flags__ & OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES) {
                let name = $name;
                let identifier = mkIdentifier(name);
                // check if the transformation is obvious & trivial to humans;
                // if not, report an error as we don't want confusion due to
                // typos and/or garbage input here producing something that
                // is usable from a machine perspective.
                if (!isLegalIdentifierInput(name)) {
                    name = name.replace(/\d/g, '');
                    if (!isLegalIdentifierInput(name) || !(yy.__options_flags__ & OPTION_ACCEPTS_000_IDENTIFIER_NAMES)) {
                        let with_value_msg = ' (with optional value assignment)';
                        if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_VALUE) {
                            with_value_msg = '';
                        }
                        yyerror(rmCommonWS`
                            Expected a valid name/argument${with_value_msg} in a ${yy.__options_category_description__} statement.
                            Entries (names) must look like regular programming language
                            identifiers, with the addition that option names MAY contain
                            '-' dashes, e.g. 'example-option-1'.

                            You may also start an option identifier with a number, but 
                            then it must not be *only* a number, so '%option 8bit' is okay,
                            while '%option 42' is not okay.

                            Suggested name:
                                ${identifier}

                              Erroneous area:
                            ${yylexer.prettyPrintRange(@name, @-1)}
                        `);
                    }
                }
                $$ = identifier;
            } else {
                $$ = $name;
            }
        }
    | '*'[star]
        {
            // validate that this is legal input under the given circumstances, i.e. parser context:
            if (!(yy.__options_flags__ & OPTION_EXPECTS_ONLY_IDENTIFIER_NAMES) || (yy.__options_flags__ & OPTION_ALSO_ACCEPTS_STAR_AS_IDENTIFIER_NAME)) {
                $$ = $star;
            } else {
                let with_value_msg = ' (with optional value assignment)';
                if (yy.__options_flags__ & OPTION_DOES_NOT_ACCEPT_VALUE) {
                    with_value_msg = '';
                }
                yyerror(rmCommonWS`
                    Expected a valid name/argument${with_value_msg} in a ${yy.__options_category_description__} statement.
                    Entries (names) must look like regular programming language
                    identifiers, with the addition that option names MAY contain
                    '-' dashes, e.g. 'example-option-1'

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@star, @-1)}
                `);
            }
        }
    ;

option_value
    : OPTION_STRING
        { $$ = JSON5.parse($OPTION_STRING); }
    | OPTION_VALUE
        { $$ = parseValue($OPTION_VALUE); }
    ;

epilogue
    : %empty
        {
            $$ = '';
        }
    | start_epilogue_marker
        {
            yy.popContext('Line 1845');

            $$ = '';
        }
    | start_epilogue_marker epilogue_chunks
        {
            let srcCode = trimActionCode($epilogue_chunks);
            if (srcCode) {
                let rv = checkActionBlock(srcCode, @epilogue_chunks, yy);
                if (rv) {
                    yyerror(rmCommonWS`
                        The '%%' lexer epilogue code does not compile: ${rv}

                          Erroneous area:
                        ${yylexer.prettyPrintRange(@epilogue_chunks, @1)}
                    `);
                }
            }

            yy.popContext('Line 1864');

            $$ = srcCode;
        }
    ;

epilogue_chunks
    : epilogue_chunks epilogue_chunk
        {
            $$ = $epilogue_chunks + $epilogue_chunk;
        }
    | epilogue_chunk
        {
            $$ = $epilogue_chunk;
        }
    ;

epilogue_chunk
    //
    // `%include` automatically injects a `ACTION_START` / `ACTION_START_AT_SOL` token.
    // We don't tolerate `ACTION_START` tokens -- indented `%{` markers -- in the epilogue.
    //
    // To help epilogue code to delineate code chunks from %include blocks in
    // pathological condition, we do support wrapping chunks of epilogue
    // in `%{...%}`.
    //
    : ACTION_START_AT_SOL action ACTION_END
        {
            let srcCode = trimActionCode($action + $ACTION_END, {
                startMarker: $ACTION_START_AT_SOL
            });
            if (srcCode) {
                let rv = checkActionBlock(srcCode, @action, yy);
                if (rv) {
                    yyerror(rmCommonWS`
                        The '%{...%}' lexer epilogue code chunk does not compile: ${rv}

                          Erroneous area:
                        ${yylexer.prettyPrintRange(@action, @ACTION_START_AT_SOL)}
                    `);
                }
            }
            // Since the epilogue is concatenated as-is (see the `epilogue_chunks` rule above)
            // we append those protective double newlines right now, as the calling site
            // won't do it for us:
            $$ = '\n\n' + srcCode + '\n\n';
        }
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | ACTION_START_AT_SOL error
        %{
            let start_marker = $ACTION_START_AT_SOL.trim();
            let marker_msg = (start_marker ? ' or similar, such as ' + start_marker : '');
            yyerror(rmCommonWS`
                There's very probably a problem with this '%{...%\}' lexer setup action code section.

                  Erroneous area:
                ${yylexer.prettyPrintRange(@ACTION_START_AT_SOL)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = '';
        %}
    //
    // see the alternative above: this rule is added to aid error
    // diagnosis of user coding.
    //
    | UNTERMINATED_ACTION_BLOCK
        %{
            // The issue has already been reported by the lexer. No need to repeat
            // ourselves with another error report from here.
            $$ = null;
        %}
    | TRAILING_CODE_CHUNK
        {
            // these code chunks are very probably incomplete, hence compile-testing
            // for these should be deferred until we've collected the entire epilogue.
            $$ = $TRAILING_CODE_CHUNK;
        }
    | error
        {
            yyerror(rmCommonWS`
                There's an error in your lexer epilogue code block.

                  Erroneous code:
                ${yylexer.prettyPrintRange(@error, @-1)}

                  Technical error report:
                ${$error.errStr}
            `);
            $$ = '';
        }
    ;

include_macro_code
    : include_keyword option_list OPTIONS_END
        {
            // check if there is only 1 unvalued options: 'path'
            let lst = $option_list;
            let len = lst.length;
            let path;
            if (len === 1 && lst[0][1] === true) {
                // `path`:
                path = lst[0][0];
            } else if (len <= 1) {
                yyerror(rmCommonWS`
                    You did not specify a legal file path for the '%include' statement, which must have the format:
                        %include file_path

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@option_list, @include_keyword)}
                `);
            } else {
                yyerror(rmCommonWS`
                    You did specify too many attributes for the '%include' statement, which must have the format:
                        %include file_path

                      Erroneous code:
                    ${yylexer.prettyPrintRange(@option_list, @include_keyword)}
                `);
            }

            if (!fs.existsSync(path)) {
                yyerror(rmCommonWS`
                    Cannot %include "${path}":
                    The file does not exist.

                    The current working directory (set up by JISON) is:

                      ${process.cwd()}

                    hence the full path to the given %include file is:

                      ${path.resolve(path)}

                      Erroneous area:
                    ${yylexer.prettyPrintRange(@$)}
                `);
                $$ = '\n\n\n\n';
            } else {
                // **Aside**: And no, we don't support nested '%include'!
                let fileContent = fs.readFileSync(path, { encoding: 'utf-8' });

                let srcCode = trimActionCode(fileContent);
                if (srcCode) {
                    let rv = checkActionBlock(srcCode, @$, yy);
                    if (rv) {
                        yyerror(rmCommonWS`
                            The source code included from file '${path}' does not compile: ${rv}

                              Erroneous area:
                            ${yylexer.prettyPrintRange(@$)}
                        `);
                    }
                }

                yy.popContext('Line 2023');

                // And no, we don't support nested '%include':
                $$ = '\n// Included by Jison: ' + path + ':\n\n' + srcCode + '\n\n// End Of Include by Jison: ' + path + '\n\n';
            }
        }
    | include_keyword error
        {
            yyerror(rmCommonWS`
                %include MUST be followed by a valid file path.

                  Erroneous path:
                ${yylexer.prettyPrintRange(@error, @include_keyword)}

                  Technical error report:
                ${$error.errStr}
            `);
            yy.popContext('Line 2040');
            $$ = null;
        }
    ;

%%


const rmCommonWS = helpers.rmCommonWS;
const checkActionBlock = helpers.checkActionBlock;
const mkIdentifier = helpers.mkIdentifier;
const isLegalIdentifierInput = helpers.isLegalIdentifierInput;
const trimActionCode = helpers.trimActionCode;
const braceArrowActionCode = helpers.braceArrowActionCode;


// see also:
// - https://en.wikipedia.org/wiki/C0_and_C1_control_codes
// - https://docs.microsoft.com/en-us/dotnet/standard/base-types/character-escapes-in-regular-expressions
// - https://kangax.github.io/compat-table/es6/#test-RegExp_y_and_u_flags
// - http://2ality.com/2015/07/regexp-es6.html
// - http://www.regular-expressions.info/quickstart.html

const charCvtTable = {
    // "\a": "\x07",
    // "\e": "\x1B",
    // "\b": "\x08",
    "\f": "\\f",
    "\n": "\\n",
    "\r": "\\r",
    "\t": "\\t",
    "\v": "\\v",
};
const escCvtTable = {
    "a": "\\x07",
    "e": "\\x1B",
    "b": "\\x08",
    "f": "\\f",
    "n": "\\n",
    "r": "\\r",
    "t": "\\t",
    "v": "\\v",
};
const codeCvtTable = {
    12: "\\f",
    10: "\\n",
    13: "\\r",
    9:  "\\t",
    11: "\\v",
};

// Note about 'b' in the regex below:
// when inside a literal string, it's BACKSPACE, otherwise it's
// the regex word edge condition `\b`. Here it's BACKSPACE.
const codedCharRe = /(?:([sSBwWdDpP])|([*+()${}|[\]\/.^?])|([aberfntv])|([0-7]{1,3})|c([@A-Z])|x([0-9a-fA-F]{2})|u([0-9a-fA-F]{4})|u\{([0-9a-fA-F]{1,8})\}|())/g;

function encodeCharCode(v) {
    if (v < 32) {
        let rv = codeCvtTable[v];
        if (rv) return rv;
        return '\\u' + ('0000' + v.toString(16)).substr(-4);
    } else {
        return String.fromCharCode(v);
    }
}

function encodeUnicodeCodepoint(v) {
    if (v < 32) {
        let rv = codeCvtTable[v];
        if (rv) return rv;
        return '\\u' + ('0000' + v.toString(16)).substr(-4);
    } else {
        return String.fromCodePoint(v);
    }
}

function encodeRegexLiteralStr(s, edge) {
    let rv = '';
    //console.warn("encodeRegexLiteralStr INPUT:", {s, edge});
    for (let i = 0, l = s.length; i < l; i++) {
        let c = s[i];
        switch (c) {
        case '\\':
            i++;
            if (i < l) {
                c = s[i];
                if (c === edge) {
                    rv += c;
                    continue;
                }
                let pos = '\'"`'.indexOf(c);
                if (pos >= 0) {
                    rv += '\\\\' + c;
                    continue;
                }
                if (c === '\\') {
                    rv += '\\\\';
                    continue;
                }
                codedCharRe.lastIndex = i;
                // we 'fake' the RegExp 'y'=sticky feature cross-platform by using 'g' flag instead
                // plus an empty capture group at the end of the regex: when that one matches,
                // we know we did not get a hit.
                let m = codedCharRe.exec(s);
                if (m && m[0]) {
                    if (m[1]) {
                        // [1]: regex operators, which occur in a literal string: `\s` --> \\s
                        rv += '\\\\' + m[1];
                        i += m[1].length - 1;
                        continue;
                    }
                    if (m[2]) {
                        // [2]: regex special characters, which occur in a literal string: `\[` --> \\\[
                        rv += '\\\\\\' + m[2];
                        i += m[2].length - 1;
                        continue;
                    }
                    if (m[3]) {
                        // [3]: special escape characters, which occur in a literal string: `\a` --> BELL
                        rv += escCvtTable[m[3]];
                        i += m[3].length - 1;
                        continue;
                    }
                    if (m[4]) {
                        // [4]: octal char: `\012` --> \x0A
                        let v = parseInt(m[4], 8);
                        rv += encodeCharCode(v);
                        i += m[4].length - 1;
                        continue;
                    }
                    if (m[5]) {
                        // [5]: CONTROL char: `\cA` --> \u0001
                        let v = m[5].charCodeAt(0) - 64;
                        rv += encodeCharCode(v);
                        i++;
                        continue;
                    }
                    if (m[6]) {
                        // [6]: hex char: `\x41` --> A
                        let v = parseInt(m[6], 16);
                        rv += encodeCharCode(v);
                        i += m[6].length;
                        continue;
                    }
                    if (m[7]) {
                        // [7]: unicode/UTS2 char: `\u03c0` --> PI
                        let v = parseInt(m[7], 16);
                        rv += encodeCharCode(v);
                        i += m[7].length;
                        continue;
                    }
                    if (m[8]) {
                        // [8]: unicode code point: `\u{00003c0}` --> PI
                        let v = parseInt(m[8], 16);
                        rv += encodeUnicodeCodepoint(v);
                        i += m[8].length;
                        continue;
                    }
                }
            }
            // all the rest: simply treat the `\\` escape as a character on its own:
            rv += '\\\\';
            i--;
            continue;

        default:
            // escape regex operators:
            let pos = ".*+?^${}()|[]/\\".indexOf(c);
            if (pos >= 0) {
                rv += '\\' + c;
                continue;
            }
            let cc = charCvtTable[c];
            if (cc) {
                rv += cc;
                continue;
            }
            cc = c.charCodeAt(0);
            if (cc < 32) {
                let rvp = codeCvtTable[v];
                if (rvp) {
                    rv += rvp;
                } else {
                    rv += '\\u' + ('0000' + cc.toString(16)).substr(-4);
                }
            } else {
                rv += c;
            }
            continue;
        }
    }
    s = rv;
    //console.warn("encodeRegexLiteralStr ROUND 3:", {s});
    return s;
}


// convert string value to number or boolean value, when possible
// (and when this is more or less obviously the intent)
// otherwise produce the string itself as value.
function parseValue(v) {
    if (v === 'false') {
        return false;
    }
    if (v === 'true') {
        return true;
    }
    // http://stackoverflow.com/questions/175739/is-there-a-built-in-way-in-javascript-to-check-if-a-string-is-a-valid-number
    // Note that the `v` check ensures that we do not convert `undefined`, `null` and `''` (empty string!)
    if (v && !isNaN(v)) {
        let rv = +v;
        if (isFinite(rv)) {
            return rv;
        }
    }
    return v;
}


parser.warn = function p_warn() {
    console.warn.apply(console, arguments);
};

parser.log = function p_log() {
    console.log.apply(console, arguments);
};

parser.pre_parse = function p_lex() {
    if (parser.yydebug) parser.log('pre_parse:', arguments);
};

parser.yy.pre_parse = function p_lex() {
    if (parser.yydebug) parser.log('pre_parse YY:', arguments);
};

parser.yy.post_lex = function p_lex() {
    if (parser.yydebug) parser.log('post_lex:', arguments);
};

