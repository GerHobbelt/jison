

const lexer = {
/* JISON-LEX-ANALYTICS-REPORT */
EOF: 1,
    ERROR: 2,

    // JisonLexerError: JisonLexerError,        /// <-- injected by the code generator

    // options: {},                             /// <-- injected by the code generator

    // yy: ...,                                 /// <-- injected by setInput()

    __currentRuleSet__: null,                   /// INTERNAL USE ONLY: internal rule set cache for the current lexer state

    __error_infos: [],                          /// INTERNAL USE ONLY: the set of lexErrorInfo objects created since the last cleanup

    __decompressed: false,                      /// INTERNAL USE ONLY: mark whether the lexer instance has been 'unfolded' completely and is now ready for use

    done: false,                                /// INTERNAL USE ONLY
    _backtrack: false,                          /// INTERNAL USE ONLY
    _input: '',                                 /// INTERNAL USE ONLY
    _more: false,                               /// INTERNAL USE ONLY
    _signaled_error_token: false,               /// INTERNAL USE ONLY
    _clear_state: 0,                            /// INTERNAL USE ONLY; 0: clear to do, 1: clear done for lex()/next(); -1: clear done for inut()/unput()/...

    conditionStack: [],                         /// INTERNAL USE ONLY; managed via `pushState()`, `popState()`, `topState()` and `stateStackSize()`

    match: '',                                  /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction. `match` is identical to `yytext` except that this one still contains the matched input string after `lexer.performAction()` has been invoked, where userland code MAY have changed/replaced the `yytext` value entirely!
    matched: '',                                /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks entire input which has been matched so far
    matches: false,                             /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks RE match result for last (successful) match attempt
    yytext: '',                                 /// ADVANCED USE ONLY: tracks input which has been matched so far for the lexer token under construction; this value is transferred to the parser as the 'token value' when the parser consumes the lexer token produced through a call to the `lex()` API.
    offset: 0,                                  /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks the 'cursor position' in the input string, i.e. the number of characters matched so far. (**WARNING:** this value MAY be negative if you `unput()` more text than you have already lexed. This type of behaviour is generally observed for one kind of 'lexer/parser hack' where custom token-illiciting characters are pushed in front of the input stream to help simulate multiple-START-points in the parser. When this happens, `base_position` will be adjusted to help track the original input's starting point in the `_input` buffer.)
    base_position: 0,                           /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: index to the original starting point of the input; always ZERO(0) unless `unput()` has pushed content before the input: see the `offset` **WARNING** just above.
    yyleng: 0,                                  /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: length of matched input for the token under construction (`yytext`)
    yylineno: 0,                                /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: 'line number' at which the token under construction is located
    yylloc: null,                               /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: tracks location info (lines + columns) for the token under construction
    CRLF_Re: /\r\n?|\n/,                        /// READ-ONLY EXTERNAL ACCESS - ADVANCED USE ONLY: regex used to split lines while tracking the lexer cursor position.

    /**
     * INTERNAL USE: construct a suitable error info hash object instance for `parseError`.
     *
     * @public
     * @this {RegExpLexer}
     */
    constructLexErrorInfo: function lexer_constructLexErrorInfo(msg, recoverable, show_input_position) {
        msg = '' + msg;

        // heuristic to determine if the error message already contains a (partial) source code dump
        // as produced by either `showPosition()` or `prettyPrintRange()`:
        if (show_input_position == undefined) {
            show_input_position = !(msg.indexOf('\n') > 0 && msg.indexOf('^') > 0);
        }
        if (this.yylloc && show_input_position) {
            if (typeof this.prettyPrintRange === 'function') {
                const pretty_src = this.prettyPrintRange(this.yylloc);

                if (!/\n\s*$/.test(msg)) {
                    msg += '\n';
                }
                msg += '\n  Erroneous area:\n' + this.prettyPrintRange(this.yylloc);
            } else if (typeof this.showPosition === 'function') {
                const pos_str = this.showPosition();
                if (pos_str) {
                    if (msg.length && msg[msg.length - 1] !== '\n' && pos_str[0] !== '\n') {
                        msg += '\n' + pos_str;
                    } else {
                        msg += pos_str;
                    }
                }
            }
        }
        
        /** @constructor */
        const pei = {
            errStr: msg,
            recoverable: !!recoverable,
            text: this.match,           // This one MAY be empty; userland code should use the `upcomingInput` API to obtain more text which follows the 'lexer cursor position'...
            token: null,
            line: this.yylineno,
            loc: this.yylloc,
            yy: this.yy,
            // lexer: this,             // OBSOLETED member since 0.7.0: will cause reference cycles if not treated very carefully, hence has memory leak risks!

            // flags to help userland code to easily recognize what sort of error they're getting fed this time:
            isLexerError: true,                // identifies this as a *lexer* error (contrasting with a *parser* error, which would have `isParserError: true`)

            yyErrorInvoked: false,             // `true` when error is caused by call to `yyerror()`
            isLexerBacktrackingNotSupportedError: false,
            isLexerInternalError: false,

            // additional attributes which will be set up in various error scenarios:
            extra_error_attributes: null,      // array of extra arguments passed to parseError = args;
            lexerHasAlreadyForwardedCursorBy1: false,

            // OBSOLETED since 0.7.0: parser and lexer error `hash` and `yy` objects are no longer carrying cyclic references, hence no more memory leak risks here.
            // 
            // /**
            //  * and make sure the error info doesn't stay due to potential
            //  * ref cycle via userland code manipulations.
            //  * These would otherwise all be memory leak opportunities!
            //  *
            //  * Note that only array and object references are nuked as those
            //  * constitute the set of elements which can produce a cyclic ref.
            //  * The rest of the members is kept intact as they are harmless.
            //  *
            //  * @public
            //  * @this {LexErrorInfo}
            //  */
            // destroy: function destructLexErrorInfo() {
            //     // remove cyclic references added to error info:
            //     // info.yy = null;
            //     // info.lexer = null;
            //     // ...
            //     const rec = !!this.recoverable;
            //     for (let key in this) {
            //         if (this[key] && this.hasOwnProperty(key) && typeof this[key] === 'object') {
            //             this[key] = undefined;
            //         }
            //     }
            //     this.recoverable = rec;
            // }
        };
        // track this instance so we can `destroy()` it once we deem it superfluous and ready for garbage collection!
        this.__error_infos.push(pei);
        return pei;
    },

    /**
     * handler which is invoked when a lexer error occurs.
     *
     * @public
     * @this {RegExpLexer}
     */
    parseError: function lexer_parseError(str, hash, ExceptionClass) {
        if (!ExceptionClass) {
            ExceptionClass = this.JisonLexerError;
        }
        if (this.yy) {
            if (this.yy.parser && typeof this.yy.parser.parseError === 'function') {
                return this.yy.parser.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            } else if (typeof this.yy.parseError === 'function') {
                return this.yy.parseError.call(this, str, hash, ExceptionClass) || this.ERROR;
            }
        }
        throw new ExceptionClass(str, hash);
    },

    /**
     * method which implements `yyerror(str, ...args)` functionality for use inside lexer actions.
     *
     * @public
     * @this {RegExpLexer}
     */
    yyerror: function yyError(str, ...args) {
        let lineno_msg = 'Lexical error';
        if (this.yylloc) {
            lineno_msg += ' on line ' + (this.yylineno + 1);
        }
        const p = this.constructLexErrorInfo(lineno_msg + ': ' + str, this.options.lexerErrorsAreRecoverable);

        // Add any extra args to the hash under the name `extra_error_attributes`:
        if (args.length) {
            p.extra_error_attributes = args;
        }
        p.yyErrorInvoked = true;   // so parseError() user code can easily recognize it is invoked from any yyerror() in the spec action code chunks

        return (this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR);
    },

    /**
     * final cleanup function for when we have completed lexing the input;
     * make it an API so that external code can use this one once userland
     * code has decided it's time to destroy any lingering lexer error
     * hash object instances and the like: this function helps to clean
     * up these constructs, which *may* carry cyclic references which would
     * otherwise prevent the instances from being properly and timely
     * garbage-collected, i.e. this function helps prevent memory leaks!
     *
     * @public
     * @this {RegExpLexer}
     */
    cleanupAfterLex: function lexer_cleanupAfterLex() {
        // prevent lingering circular references from causing memory leaks:
        this.setInput('', {});

        // nuke the error hash info instances created during this run.
        // Userland code must COPY any data/references
        // in the error hash instance(s) it is more permanently interested in.
        for (let i = this.__error_infos.length - 1; i >= 0; i--) {
            let el = this.__error_infos[i];
            if (el && typeof el.destroy === 'function') {
                el.destroy();
            }
        }
        this.__error_infos.length = 0;

        return this;
    },

    /**
     * clear the lexer token context; intended for internal use only
     *
     * @public
     * @this {RegExpLexer}
     */
    clear: function lexer_clear() {
        this.yytext = '';
        this.yyleng = 0;
        this.match = '';
        // - DO NOT reset `this.matched`
        this.matches = false;

        this._more = false;
        this._backtrack = false;

        const col = this.yylloc.last_column;
        this.yylloc = {
            first_line: this.yylineno + 1,
            first_column: col,
            last_line: this.yylineno + 1,
            last_column: col,

            range: [ this.offset, this.offset ]
        };
    },

    /**
     * resets the lexer, sets new input
     *
     * @public
     * @this {RegExpLexer}
     */
    setInput: function lexer_setInput(input, yy) {
        this.yy = yy || this.yy || {};

        // also check if we've fully initialized the lexer instance,
        // including expansion work to be done to go from a loaded
        // lexer to a usable lexer:
        if (!this.__decompressed) {
            // step 1: decompress the regex list:
            let rules = this.rules;
            for (let i = 0, len = rules.length; i < len; i++) {
                let rule_re = rules[i];

                // compression: is the RE an xref to another RE slot in the rules[] table?
                if (typeof rule_re === 'number') {
                    rules[i] = rules[rule_re];
                }
            }

            // step 2: unfold the conditions[] set to make these ready for use:
            let conditions = this.conditions;
            for (let k in conditions) {
                let spec = conditions[k];

                let rule_ids = spec.rules;

                let len = rule_ids.length;
                let rule_regexes = new Array(len + 1);            // slot 0 is unused; we use a 1-based index approach here to keep the hottest code in `lexer_next()` fast and simple!
                let rule_new_ids = new Array(len + 1);

                for (let i = 0; i < len; i++) {
                    let idx = rule_ids[i];
                    let rule_re = rules[idx];
                    rule_regexes[i + 1] = rule_re;
                    rule_new_ids[i + 1] = idx;
                }

                spec.rules = rule_new_ids;
                spec.__rule_regexes = rule_regexes;
                spec.__rule_count = len;
            }

            this.__decompressed = true;
        }

        if (input && typeof input !== 'string') {
            input = '' + input;
        }
        this._input = input || '';
        this._clear_state = -1;
        this._signaled_error_token = false;
        this.done = false;
        this.yylineno = 0;
        this.matched = '';
        this.conditionStack = [ 'INITIAL' ];
        this.__currentRuleSet__ = null;
        this.yylloc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,

            range: [ 0, 0 ]
        };
        this.offset = 0;
        this.base_position = 0;
        // apply these bits of `this.clear()` as well:
        this.yytext = '';
        this.yyleng = 0;
        this.match = '';
        this.matches = false;

        this._more = false;
        this._backtrack = false;

        return this;
    },

    /**
     * edit the remaining input via user-specified callback.
     * This can be used to forward-adjust the input-to-parse,
     * e.g. inserting macro expansions and alike in the
     * input which has yet to be lexed.
     * The behaviour of this API contrasts the `unput()` et al
     * APIs as those act on the *consumed* input, while this
     * one allows one to manipulate the future, without impacting
     * the current `yyloc` cursor location or any history.
     *
     * Use this API to help implement C-preprocessor-like
     * `#include` statements, etc.
     *
     * The provided callback must be synchronous and is
     * expected to return the edited input (string).
     *
     * The `cpsArg` argument value is passed to the callback
     * as-is.
     *
     * `callback` interface:
     * `function callback(input, cpsArg)`
     *
     * - `input` will carry the remaining-input-to-lex string
     *   from the lexer.
     * - `cpsArg` is `cpsArg` passed into this API.
     *
     * The `this` reference for the callback will be set to
     * reference this lexer instance so that userland code
     * in the callback can easily and quickly access any lexer
     * API.
     *
     * When the callback returns a non-string-type falsey value,
     * we assume the callback did not edit the input and we
     * will using the input as-is.
     *
     * When the callback returns a non-string-type value, it
     * is converted to a string for lexing via the `"" + retval`
     * operation. (See also why: http://2ality.com/2012/03/converting-to-string.html
     * -- that way any returned object's `toValue()` and `toString()`
     * methods will be invoked in a proper/desirable order.)
     *
     * @public
     * @this {RegExpLexer}
     */
    editRemainingInput: function lexer_editRemainingInput(callback, cpsArg) {
        const rv = callback.call(this, this._input, cpsArg);
        if (typeof rv !== 'string') {
            if (rv) {
                this._input = '' + rv;
            }
            // else: keep `this._input` as is.
        } else {
            this._input = rv;
        }
        return this;
    },

    /**
     * consumes and returns one char from the input
     *
     * @public
     * @this {RegExpLexer}
     */
    input: function lexer_input() {
        if (!this._input) {
            //this.done = true;    -- don't set `done` as we want the lex()/next() API to be able to produce one custom EOF token match after this anyhow. (lexer can match special <<EOF>> tokens and perform user action code for a <<EOF>> match, but only does so *once*)
            return null;
        }
        if (!this._clear_state && !this._more) {
            this._clear_state = -1;
            this.clear();
        }
        let ch = this._input[0];
        this.yytext += ch;
        this.yyleng++;
        this.offset++;
        this.match += ch;
        this.matched += ch;
        // Count the linenumber up when we hit the LF (or a stand-alone CR).
        // On CRLF, the linenumber is incremented when you fetch the CR or the CRLF combo
        // and we advance immediately past the LF as well, returning both together as if
        // it was all a single 'character' only.
        let slice_len = 1;
        let lines = false;
        if (ch === '\n') {
            lines = true;
        } else if (ch === '\r') {
            lines = true;
            const ch2 = this._input[1];
            if (ch2 === '\n') {
                slice_len++;
                ch += ch2;
                this.yytext += ch2;
                this.yyleng++;
                this.offset++;
                this.match += ch2;
                this.matched += ch2;
                this.yylloc.range[1]++;
            }
        }
        if (lines) {
            this.yylineno++;
            this.yylloc.last_line++;
            this.yylloc.last_column = 0;
        } else {
            this.yylloc.last_column++;
        }
        this.yylloc.range[1]++;

        this._input = this._input.slice(slice_len);
        return ch;
    },

    /**
     * unshifts one char (or an entire string) into the input
     *
     * @public
     * @this {RegExpLexer}
     */
    unput: function lexer_unput(ch) {
        let len = ch.length;
        let lines = ch.split(this.CRLF_Re);

        if (!this._clear_state && !this._more) {
            this._clear_state = -1;
            this.clear();
        }

        this._input = ch + this._input;
        this.yytext = this.yytext.substr(0, this.yytext.length - len);
        this.yyleng = this.yytext.length;
        this.offset -= len;
        // **WARNING:**
        // The `offset` value MAY be negative if you `unput()` more text than you have already lexed.
        // This type of behaviour is generally observed for one kind of 'lexer/parser hack'
        // where custom token-illiciting characters are pushed in front of the input stream to help
        // simulate multiple-START-points in the parser.
        // When this happens, `base_position` will be adjusted to help track the original input's
        // starting point in the `_input` buffer.
        if (-this.offset > this.base_position) {
            this.base_position = -this.offset;
        }
        this.match = this.match.substr(0, this.match.length - len);
        this.matched = this.matched.substr(0, this.matched.length - len);

        if (lines.length > 1) {
            this.yylineno -= lines.length - 1;

            this.yylloc.last_line = this.yylineno + 1;

            // Get last entirely matched line into the `pre_lines[]` array's
            // last index slot; we don't mind when other previously
            // matched lines end up in the array too.
            let pre = this.match;
            let pre_lines = pre.split(this.CRLF_Re);
            if (pre_lines.length === 1) {
                pre = this.matched;
                pre_lines = pre.split(this.CRLF_Re);
            }
            this.yylloc.last_column = pre_lines[pre_lines.length - 1].length;
        } else {
            this.yylloc.last_column -= len;
        }

        this.yylloc.range[1] = this.yylloc.range[0] + this.yyleng;

        this.done = false;
        return this;
    },

    /**
     * return the upcoming input *which has not been lexed yet*.
     * This can, for example, be used for custom look-ahead inspection code
     * in your lexer.
     *
     * The entire pending input string is returned.
     *
     * > ### NOTE ###
     * >
     * > When augmenting error reports and alike, you might want to
     * > look at the `upcomingInput()` API instead, which offers more
     * > features for limited input extraction and which includes the
     * > part of the input which has been lexed by the last token a.k.a.
     * > the *currently lexed* input.
     * >
     *
     * @public
     * @this {RegExpLexer}
     */
    lookAhead: function lexer_lookAhead() {
        return this._input || '';
    },

    /**
     * cache matched text and append it on next action
     *
     * @public
     * @this {RegExpLexer}
     */
    more: function lexer_more() {
        this._more = true;
        return this;
    },

    /**
     * signal the lexer that this rule fails to match the input, so the
     * next matching rule (regex) should be tested instead.
     *
     * @public
     * @this {RegExpLexer}
     */
    reject: function lexer_reject() {
        if (this.options.backtrack_lexer) {
            this._backtrack = true;
        } else {
            // when the `parseError()` call returns, we MUST ensure that the error is registered.
            // We accomplish this by signaling an 'error' token to be produced for the current
            // `.lex()` run.
            let lineno_msg = 'Lexical error';
            if (this.yylloc) {
                lineno_msg += ' on line ' + (this.yylineno + 1);
            }
            const p = this.constructLexErrorInfo(lineno_msg + ': You can only invoke reject() in the lexer when the lexer is of the backtracking persuasion (options.backtrack_lexer = true).', false);
            p.isLexerBacktrackingNotSupportedError = true;            // when this is true, you 'know' the produced error token will be queued.
            this._signaled_error_token = (this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR);
        }
        return this;
    },

    /**
     * retain first n characters of the match
     *
     * @public
     * @this {RegExpLexer}
     */
    less: function lexer_less(n) {
        return this.unput(this.match.slice(n));
    },

    /**
     * return (part of the) already matched input, i.e. for error
     * messages.
     *
     * Limit the returned string length to `maxSize` (default: 20).
     *
     * Limit the returned string to the `maxLines` number of lines of
     * input (default: 1).
     *
     * A negative `maxSize` limit value equals *unlimited*, i.e.
     * produce the entire input that has already been lexed.
     *
     * A negative `maxLines` limit value equals *unlimited*, i.e. limit the result
     * to the `maxSize` specified number of characters *only*.
     *
     * @public
     * @this {RegExpLexer}
     */
    pastInput: function lexer_pastInput(maxSize, maxLines) {
        let past = this.matched.substring(0, this.matched.length - this.match.length);
        if (maxSize < 0) {
            maxSize = Infinity;
        } else if (!maxSize) {
            maxSize = 20;
        }
        if (maxLines < 0) {
            maxLines = Infinity;          // can't ever have more input lines than this!
        } else if (!maxLines) {
            maxLines = 1;
        }
        // `substr` anticipation: treat \r\n as a single character and take a little
        // more than necessary so that we can still properly check against maxSize
        // after we've transformed and limited the newLines in here:
        past = past.substr(-maxSize * 2 - 2);
        // now that we have a significantly reduced string to process, transform the newlines
        // and chop them, then limit them:
        let a = past.split(this.CRLF_Re);
        a = a.slice(-maxLines);
        past = a.join('\n');
        // When, after limiting to maxLines, we still have too much to return,
        // do add an ellipsis prefix...
        if (past.length > maxSize) {
            past = '...' + past.substr(-maxSize);
        }
        return past;
    },

    /**
     * return (part of the) upcoming input *including* the input
     * matched by the last token (see also the NOTE below).
     * This can be used to augment error messages, for example.
     *
     * Limit the returned string length to `maxSize` (default: 20).
     *
     * Limit the returned string to the `maxLines` number of lines of input (default: 1).
     *
     * A negative `maxSize` limit value equals *unlimited*, i.e.
     * produce the entire input that is yet to be lexed.
     *
     * A negative `maxLines` limit value equals *unlimited*, i.e. limit the result
     * to the `maxSize` specified number of characters *only*.
     *
     * > ### NOTE ###
     * >
     * > *"upcoming input"* is defined as the whole of the both
     * > the *currently lexed* input, together with any remaining input
     * > following that. *"currently lexed"* input is the input
     * > already recognized by the lexer but not yet returned with
     * > the lexer token. This happens when you are invoking this API
     * > from inside any lexer rule action code block.
     * >
     * > When you want access to the 'upcoming input' in that you want access
     * > to the input *which has not been lexed yet* for look-ahead
     * > inspection or likewise purposes, please consider using the
     * > `lookAhead()` API instead.
     * >
     *
     * @public
     * @this {RegExpLexer}
     */
    upcomingInput: function lexer_upcomingInput(maxSize, maxLines) {
        let next = this.match;
        let source = this._input || '';
        if (maxSize < 0) {
            maxSize = next.length + source.length;
        } else if (!maxSize) {
            maxSize = 20;
        }

        if (maxLines < 0) {
            maxLines = maxSize;          // can't ever have more input lines than this!
        } else if (!maxLines) {
            maxLines = 1;
        }
        // `substring` anticipation: treat \r\n as a single character and take a little
        // more than necessary so that we can still properly check against maxSize
        // after we've transformed and limited the newLines in here:
        if (next.length < maxSize * 2 + 2) {
            next += source.substring(0, maxSize * 2 + 2 - next.length);  // substring is faster on Chrome/V8
        }
        // now that we have a significantly reduced string to process, transform the newlines
        // and chop them, then limit them:
        let a = next.split(this.CRLF_Re, maxLines + 1);     // stop splitting once we have reached just beyond the reuired number of lines.
        a = a.slice(0, maxLines);
        next = a.join('\n');
        // When, after limiting to maxLines, we still have too much to return,
        // do add an ellipsis postfix...
        if (next.length > maxSize) {
            next = next.substring(0, maxSize) + '...';
        }
        return next;
    },

    /**
     * return a string which displays the character position where the
     * lexing error occurred, i.e. for error messages
     *
     * @public
     * @this {RegExpLexer}
     */
    showPosition: function lexer_showPosition(maxPrefix, maxPostfix) {
        const pre = this.pastInput(maxPrefix).replace(/\s/g, ' ');
        let c = new Array(pre.length + 1).join('-');
        return pre + this.upcomingInput(maxPostfix).replace(/\s/g, ' ') + '\n' + c + '^';
    },

    /**
     * return an YYLLOC info object derived off the given context (actual, preceding, following, current).
     * Use this method when the given `actual` location is not guaranteed to exist (i.e. when
     * it MAY be NULL) and you MUST have a valid location info object anyway:
     * then we take the given context of the `preceding` and `following` locations, IFF those are available,
     * and reconstruct the `actual` location info from those.
     * If this fails, the heuristic is to take the `current` location, IFF available.
     * If this fails as well, we assume the sought location is at/around the current lexer position
     * and then produce that one as a response. DO NOTE that these heuristic/derived location info
     * values MAY be inaccurate!
     *
     * NOTE: `deriveLocationInfo()` ALWAYS produces a location info object *copy* of `actual`, not just
     * a *reference* hence all input location objects can be assumed to be 'constant' (function has no side-effects).
     *
     * @public
     * @this {RegExpLexer}
     */
    deriveLocationInfo: function lexer_deriveYYLLOC(actual, preceding, following, current) {
        let loc = {
            first_line: 1,
            first_column: 0,
            last_line: 1,
            last_column: 0,

            range: [ 0, 0 ]
        };
        if (actual) {
            loc.first_line = actual.first_line | 0;
            loc.last_line = actual.last_line | 0;
            loc.first_column = actual.first_column | 0;
            loc.last_column = actual.last_column | 0;

            if (actual.range) {
                loc.range[0] = actual.range[0] | 0;
                loc.range[1] = actual.range[1] | 0;
            }
        }
        if (loc.first_line <= 0 || loc.last_line < loc.first_line) {
            // plan B: heuristic using preceding and following:
            if (loc.first_line <= 0 && preceding) {
                loc.first_line = preceding.last_line | 0;
                loc.first_column = preceding.last_column | 0;

                if (preceding.range) {
                    loc.range[0] = actual.range[1] | 0;
                }
            }

            if ((loc.last_line <= 0 || loc.last_line < loc.first_line) && following) {
                loc.last_line = following.first_line | 0;
                loc.last_column = following.first_column | 0;

                if (following.range) {
                    loc.range[1] = actual.range[0] | 0;
                }
            }

            // plan C?: see if the 'current' location is useful/sane too:
            if (loc.first_line <= 0 && current && (loc.last_line <= 0 || current.last_line <= loc.last_line)) {
                loc.first_line = current.first_line | 0;
                loc.first_column = current.first_column | 0;

                if (current.range) {
                    loc.range[0] = current.range[0] | 0;
                }
            }

            if (loc.last_line <= 0 && current && (loc.first_line <= 0 || current.first_line >= loc.first_line)) {
                loc.last_line = current.last_line | 0;
                loc.last_column = current.last_column | 0;

                if (current.range) {
                    loc.range[1] = current.range[1] | 0;
                }
            }
        }
        // sanitize: fix last_line BEFORE we fix first_line as we use the 'raw' value of the latter
        // or plan D heuristics to produce a 'sensible' last_line value:
        if (loc.last_line <= 0) {
            if (loc.first_line <= 0) {
                loc.first_line = this.yylloc.first_line;
                loc.last_line = this.yylloc.last_line;
                loc.first_column = this.yylloc.first_column;
                loc.last_column = this.yylloc.last_column;

                loc.range[0] = this.yylloc.range[0];
                loc.range[1] = this.yylloc.range[1];
            } else {
                loc.last_line = this.yylloc.last_line;
                loc.last_column = this.yylloc.last_column;

                loc.range[1] = this.yylloc.range[1];
            }
        }
        if (loc.first_line <= 0) {
            loc.first_line = loc.last_line;
            loc.first_column = 0; // loc.last_column;

            loc.range[1] = loc.range[0];
        }
        if (loc.first_column < 0) {
            loc.first_column = 0;
        }
        if (loc.last_column < 0) {
            loc.last_column = (loc.first_column > 0 ? loc.first_column : 80);
        }
        return loc;
    },

    /**
     * return a string which displays the lines & columns of input which are referenced
     * by the given location info range, plus a few lines of context.
     *
     * This function pretty-prints the indicated section of the input, with line numbers
     * and everything!
     *
     * This function is very useful to provide highly readable error reports, while
     * the location range may be specified in various flexible ways:
     *
     * - `loc` is the location info object which references the area which should be
     *   displayed and 'marked up': these lines & columns of text are marked up by `^`
     *   characters below each character in the entire input range.
     *
     * - `context_loc` is the *optional* location info object which instructs this
     *   pretty-printer how much *leading* context should be displayed alongside
     *   the area referenced by `loc`. This can help provide context for the displayed
     *   error, etc.
     *
     *   When this location info is not provided, a default context of 3 lines is
     *   used.
     *
     * - `context_loc2` is another *optional* location info object, which serves
     *   a similar purpose to `context_loc`: it specifies the amount of *trailing*
     *   context lines to display in the pretty-print output.
     *
     *   When this location info is not provided, a default context of 1 line only is
     *   used.
     *
     * Special Notes:
     *
     * - when the `loc`-indicated range is very large (about 5 lines or more), then
     *   only the first and last few lines of this block are printed while a
     *   `...continued...` message will be printed between them.
     *
     *   This serves the purpose of not printing a huge amount of text when the `loc`
     *   range happens to be huge: this way a manageable & readable output results
     *   for arbitrary large ranges.
     *
     * - this function can display lines of input which whave not yet been lexed.
     *   `prettyPrintRange()` can access the entire input!
     *
     * @public
     * @this {RegExpLexer}
     */
    prettyPrintRange: function lexer_prettyPrintRange(loc, context_loc, context_loc2) {
        loc = this.deriveLocationInfo(loc, context_loc, context_loc2);

        const CONTEXT = 3;
        const CONTEXT_TAIL = 1;
        const MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT = 2;
        let input = this.matched + (this._input || '');
        let lines = input.split('\n');
        let l0 = Math.max(1, (context_loc ? context_loc.first_line : loc.first_line - CONTEXT));
        let l1 = Math.max(1, (context_loc2 ? context_loc2.last_line : loc.last_line + CONTEXT_TAIL));
        let lineno_display_width = (1 + Math.log10(l1 | 1) | 0);
        let ws_prefix = new Array(lineno_display_width).join(' ');
        let nonempty_line_indexes = [ [], [], [] ];
        let rv = lines.slice(l0 - 1, l1 + 1).map(function injectLineNumber(line, index) {
            let lno = index + l0;
            let lno_pfx = (ws_prefix + lno).substr(-lineno_display_width);
            let rv = lno_pfx + ': ' + line;
            let errpfx = (new Array(lineno_display_width + 1)).join('^');
            let offset = 2 + 1;
            let len = 0;

            if (lno === loc.first_line) {
                offset += loc.first_column;

                len = Math.max(
                    2,
                    ((lno === loc.last_line ? loc.last_column : line.length)) - loc.first_column + 1
                );
            } else if (lno === loc.last_line) {
                len = Math.max(2, loc.last_column + 1);
            } else if (lno > loc.first_line && lno < loc.last_line) {
                len = Math.max(2, line.length + 1);
            }

            let nli;
            if (len) {
                let lead = new Array(offset).join('.');
                let mark = new Array(len).join('^');
                rv += '\n' + errpfx + lead + mark;

                nli = 1;
            } else if (lno < loc.first_line) {
                nli = 0;
            } else if (lno > loc.last_line) {
                nli = 2;
            }

            if (line.trim().length > 0) {
                nonempty_line_indexes[nli].push(index);
            }

            rv = rv.replace(/\t/g, ' ');
            return rv;
        });

        // now make sure we don't print an overly large amount of lead/error/tail area: limit it
        // to the top and bottom line count:
        for (let i = 0; i <= 2; i++) {
            let line_arr = nonempty_line_indexes[i];
            if (line_arr.length > 2 * MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT) {
                let clip_start = line_arr[MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT - 1] + 1;
                let clip_end = line_arr[line_arr.length - MINIMUM_VISIBLE_NONEMPTY_LINE_COUNT] - 1;

                let intermediate_line = (new Array(lineno_display_width + 1)).join(' ') +     '  (...continued...)';
                if (i === 1) {
                    intermediate_line += '\n' + (new Array(lineno_display_width + 1)).join('-') + '  (---------------)';
                }
                rv.splice(clip_start, clip_end - clip_start + 1, intermediate_line);
            }
        }

        return rv.join('\n');
    },

    /**
     * helper function, used to produce a human readable description as a string, given
     * the input `yylloc` location object.
     *
     * Set `display_range_too` to TRUE to include the string character index position(s)
     * in the description if the `yylloc.range` is available.
     *
     * @public
     * @this {RegExpLexer}
     */
    describeYYLLOC: function lexer_describe_yylloc(yylloc, display_range_too) {
        let l1 = yylloc.first_line;
        let l2 = yylloc.last_line;
        let c1 = yylloc.first_column;
        let c2 = yylloc.last_column;
        let dl = l2 - l1;
        let dc = c2 - c1;
        let rv;
        if (dl === 0) {
            rv = 'line ' + l1 + ', ';
            if (dc <= 1) {
                rv += 'column ' + c1;
            } else {
                rv += 'columns ' + c1 + ' .. ' + c2;
            }
        } else {
            rv = 'lines ' + l1 + '(column ' + c1 + ') .. ' + l2 + '(column ' + c2 + ')';
        }
        if (yylloc.range && display_range_too) {
            let r1 = yylloc.range[0];
            let r2 = yylloc.range[1] - 1;
            if (r2 <= r1) {
                rv += ' {String Offset: ' + r1 + '}';
            } else {
                rv += ' {String Offset range: ' + r1 + ' .. ' + r2 + '}';
            }
        }
        return rv;
    },

    /**
     * test the lexed token: return FALSE when not a match, otherwise return token.
     *
     * `match` is supposed to be an array coming out of a regex match, i.e. `match[0]`
     * contains the actually matched text string.
     *
     * Also move the input cursor forward and update the match collectors:
     *
     * - `yytext`
     * - `yyleng`
     * - `match`
     * - `matches`
     * - `yylloc`
     * - `offset`
     *
     * @public
     * @this {RegExpLexer}
     */
    test_match: function lexer_test_match(match, indexed_rule) {
        let backup;

        if (this.options.backtrack_lexer) {
            // save context
            backup = {
                yylineno: this.yylineno,
                yylloc: {
                    first_line: this.yylloc.first_line,
                    last_line: this.yylloc.last_line,
                    first_column: this.yylloc.first_column,
                    last_column: this.yylloc.last_column,

                    range: this.yylloc.range.slice()
                },
                yytext: this.yytext,
                match: this.match,
                matches: this.matches,
                matched: this.matched,
                yyleng: this.yyleng,
                offset: this.offset,
                _more: this._more,
                _input: this._input,
                //_signaled_error_token: this._signaled_error_token,
                yy: this.yy,
                conditionStack: this.conditionStack.slice(),
                done: this.done
            };
        }

        let match_str = match[0];
        let match_str_len = match_str.length;

        let lines = match_str.split(this.CRLF_Re);
        if (lines.length > 1) {
            this.yylineno += lines.length - 1;

            this.yylloc.last_line = this.yylineno + 1;
            this.yylloc.last_column = lines[lines.length - 1].length;
        } else {
            this.yylloc.last_column += match_str_len;
        }

        this.yytext += match_str;
        this.match += match_str;
        this.matched += match_str;
        this.matches = match;
        this.yyleng = this.yytext.length;
        this.yylloc.range[1] += match_str_len;

        // previous lex rules MAY have invoked the `more()` API rather than producing a token:
        // those rules will already have moved this `offset` forward matching their match lengths,
        // hence we must only add our own match length now:
        this.offset += match_str_len;
        this._more = false;
        this._backtrack = false;
        this._input = this._input.slice(match_str_len);

        // calling this method:
        //
        //   function lexer__performAction(yy, yyrulenumber, YY_START) {...}
        let token = this.performAction.call(this, this.yy, indexed_rule, this.conditionStack[this.conditionStack.length - 1] /* = YY_START */);
        // otherwise, when the action codes are all simple return token statements:
        //token = this.simpleCaseActionClusters[indexed_rule];

        if (this.done && this._input) {
            this.done = false;
        }
        if (token) {
            return token;
        } else if (this._backtrack) {
            // recover context
            for (let k in backup) {
                this[k] = backup[k];
            }
            this.__currentRuleSet__ = null;
            return false; // rule action called reject() implying the next rule should be tested instead.
        } else if (this._signaled_error_token) {
            // produce one 'error' token as `.parseError()` in `reject()`
            // did not guarantee a failure signal by throwing an exception!
            token = this._signaled_error_token;
            this._signaled_error_token = false;
            return token;
        }
        return false;
    },

    /**
     * return next match in input
     *
     * @public
     * @this {RegExpLexer}
     */
    next: function lexer_next() {
        if (this.done) {
            this.clear();
            return this.EOF;
        }
        if (!this._input) {
            this.done = true;
        }

        if (!this._more) {
            if (!this._clear_state) {
                this._clear_state = 1;
            }
            this.clear();
        }
        let spec = this.__currentRuleSet__;
        if (!spec) {
            // Update the ruleset cache as we apparently encountered a state change or just started lexing.
            // The cache is set up for fast lookup -- we assume a lexer will switch states much less often than it will
            // invoke the `lex()` token-producing API and related APIs, hence caching the set for direct access helps
            // speed up those activities a tiny bit.
            spec = this.__currentRuleSet__ = this._currentRules();
            // Check whether a *sane* condition has been pushed before: this makes the lexer robust against
            // user-programmer bugs such as https://github.com/zaach/jison-lex/issues/19
            if (!spec || !spec.rules) {
                let lineno_msg = '';
                if (this.yylloc) {
                    lineno_msg = ' on line ' + (this.yylineno + 1);
                }
                const p = this.constructLexErrorInfo('Internal lexer engine error' + lineno_msg + ': The lex grammar programmer pushed a non-existing condition name "' + this.topState() + '"; this is a fatal error and should be reported to the application programmer team!', false);
                p.isLexerInternalError = true;
                // produce one 'error' token until this situation has been resolved, most probably by parse termination!
                return (this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR);
            }
        }

        {
            let rule_ids = spec.rules;
            let regexes = spec.__rule_regexes;
            let len = spec.__rule_count;
            let match;
            let index;

            // Note: the arrays are 1-based, while `len` itself is a valid index,
            // hence the non-standard less-or-equal check in the next loop condition!
            for (let i = 1; i <= len; i++) {
                let tempMatch = this._input.match(regexes[i]);
                if (tempMatch && (!match || tempMatch[0].length > match[0].length)) {
                    match = tempMatch;
                    index = i;
                    if (this.options.backtrack_lexer) {
                        let token = this.test_match(tempMatch, rule_ids[i]);
                        if (token !== false) {
                            return token;
                        } else if (this._backtrack) {
                            match = undefined;
                            continue; // rule action called reject() implying a rule MISmatch.
                        } else {
                            // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                            return false;
                        }
                    } else if (!this.options.flex) {
                        break;
                    }
                }
            }

            if (match) {
                let token = this.test_match(match, rule_ids[index]);
                if (token !== false) {
                    return token;
                }
                // else: this is a lexer rule which consumes input without producing a token (e.g. whitespace)
                return false;
            }
        }

        if (!this._input) {
            this.done = true;
            this.clear();
            return this.EOF;
        }

        {
            let lineno_msg = 'Lexical error';
            if (this.yylloc) {
                lineno_msg += ' on line ' + (this.yylineno + 1);
            }
            const p = this.constructLexErrorInfo(lineno_msg + ': Unrecognized text.', this.options.lexerErrorsAreRecoverable);

            let pendingInput = this._input;
            let activeCondition = this.topState();
            let conditionStackDepth = this.conditionStack.length;

            // when this flag is set in your parseError() `hash`, you 'know' you cannot manipute `yytext` to be anything but 
            // a string value, unless
            // - you either get to experience a lexer crash once it invokes .input() with your manipulated `yytext` object,
            // - or you must forward the lex cursor yourself by invoking `yy.input()` or equivalent, *before* you go and
            //   tweak that `yytext`.
            p.lexerHasAlreadyForwardedCursorBy1 = (!this.matches);

            // Simplify use of (advanced) custom parseError() handlers: every time we encounter an error,
            // which HAS NOT consumed any input yet (thus causing an infinite lexer loop unless we take special action),
            // we FIRST consume ONE character of input, BEFORE we call parseError().
            // 
            // This implies that the parseError() now can call `unput(this.yytext)` if it wants to only change lexer
            // state via popState/pushState, but otherwise this would make for a cleaner parseError() implementation
            // as there's no conditional check for `hash.lexerHasAlreadyForwardedCursorBy1` needed in there any more.
            // 
            // Since that flag is new as of jison-gho 0.7.0, as is this new consume1+parseError() behaviour, only
            // sophisticated userland parseError() methods will need to be reviewed.
            // Haven't found any of those in the (Open Source) wild today, so this should be safe to change...

            // *** CONSUME 1 ***:
                        
            //if (token === this.ERROR) {
            //    ^^^^^^^^^^^^^^^^^^^^ WARNING: no matter what token the error handler produced, 
            //                         it MUST move the cursor forward or you'ld end up in 
            //                         an infinite lex loop, unless one or more of the following 
            //                         conditions was changed, so as to change the internal lexer 
            //                         state and thus enable it to produce a different token:
            //                         
                // we can try to recover from a lexer error that `parseError()` did not 'recover' for us
                // by moving forward at least one character at a time IFF the (user-specified?) `parseError()`
                // has not consumed/modified any pending input or changed state in the error handler:
                if (!this.matches &&
                    // and make sure the input has been modified/consumed ...
                    pendingInput === this._input &&
                    // ...or the lexer state has been modified significantly enough
                    // to merit a non-consuming error handling action right now.
                    activeCondition === this.topState() &&
                    conditionStackDepth === this.conditionStack.length
                ) {
                    this.input();
                }
            //}

            // *** PARSE-ERROR ***:
            // 
            // Note:
            // userland code in there may `unput()` what was done, after checking the `hash.lexerHasAlreadyForwardedCursorBy1` flag.
            // Caveat emptor! :: When you simply `unput()` the `yytext` without at least changing the lexer condition state 
            // via popState/pushState, you WILL end up with an infinite lexer loop. 
            // 
            // This kernel code has been coded to prevent this dangerous situation unless you specifically seek it out
            // in your custom parseError handler.
                        
            return (this.parseError(p.errStr, p, this.JisonLexerError) || this.ERROR);
        }
    },

    /**
     * return next match that has a token
     *
     * @public
     * @this {RegExpLexer}
     */
    lex: function lexer_lex() {
        let r;

        //this._clear_state = 0;

        if (!this._more) {
            if (!this._clear_state) {
                this._clear_state = 1;
            }
            this.clear();
        }

        // allow the PRE/POST handlers set/modify the return token for maximum flexibility of the generated lexer:
        if (typeof this.pre_lex === 'function') {
            r = this.pre_lex.call(this, 0);
        }
        if (typeof this.options.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.pre_lex.call(this, r) || r;
        }
        if (this.yy && typeof this.yy.pre_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.pre_lex.call(this, r) || r;
        }

        while (!r) {
            r = this.next();
        }

        if (this.yy && typeof this.yy.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.yy.post_lex.call(this, r) || r;
        }
        if (typeof this.options.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.options.post_lex.call(this, r) || r;
        }
        if (typeof this.post_lex === 'function') {
            // (also account for a userdef function which does not return any value: keep the token as is)
            r = this.post_lex.call(this, r) || r;
        }

        if (!this._more) {
            //
            // 1) make sure any outside interference is detected ASAP:
            //    these attributes are to be treated as 'const' values
            //    once the lexer has produced them with the token (return value `r`).
            // 2) make sure any subsequent `lex()` API invocation CANNOT
            //    edit the `yytext`, etc. token attributes for the *current*
            //    token, i.e. provide a degree of 'closure safety' so that
            //    code like this:
            //
            //        t1 = lexer.lex();
            //        v = lexer.yytext;
            //        l = lexer.yylloc;
            //        t2 = lexer.lex();
            //        assert(lexer.yytext !== v);
            //        assert(lexer.yylloc !== l);
            //
            //    succeeds. Older (pre-v0.6.5) jison versions did not *guarantee*
            //    these conditions.
            //
            this.yytext = Object.freeze(this.yytext);
            this.matches = Object.freeze(this.matches);
            this.yylloc.range = Object.freeze(this.yylloc.range);
            this.yylloc = Object.freeze(this.yylloc);

            this._clear_state = 0;
        }

        return r;
    },

    /**
     * return next match that has a token. Identical to the `lex()` API but does not invoke any of the
     * `pre_lex()` nor any of the `post_lex()` callbacks.
     *
     * @public
     * @this {RegExpLexer}
     */
    fastLex: function lexer_fastLex() {
        let r;

        //this._clear_state = 0;

        while (!r) {
            r = this.next();
        }

        if (!this._more) {
            //
            // 1) make sure any outside interference is detected ASAP:
            //    these attributes are to be treated as 'const' values
            //    once the lexer has produced them with the token (return value `r`).
            // 2) make sure any subsequent `lex()` API invocation CANNOT
            //    edit the `yytext`, etc. token attributes for the *current*
            //    token, i.e. provide a degree of 'closure safety' so that
            //    code like this:
            //
            //        t1 = lexer.lex();
            //        v = lexer.yytext;
            //        l = lexer.yylloc;
            //        t2 = lexer.lex();
            //        assert(lexer.yytext !== v);
            //        assert(lexer.yylloc !== l);
            //
            //    succeeds. Older (pre-v0.6.5) jison versions did not *guarantee*
            //    these conditions.
            //
            this.yytext = Object.freeze(this.yytext);
            this.matches = Object.freeze(this.matches);
            this.yylloc.range = Object.freeze(this.yylloc.range);
            this.yylloc = Object.freeze(this.yylloc);

            this._clear_state = 0;
        }

        return r;
    },

    /**
     * return info about the lexer state that can help a parser or other lexer API user to use the
     * most efficient means available. This API is provided to aid run-time performance for larger
     * systems which employ this lexer.
     *
     * @public
     * @this {RegExpLexer}
     */
    canIUse: function lexer_canIUse() {
        const rv = {
            fastLex: !(
                typeof this.pre_lex === 'function' ||
                typeof this.options.pre_lex === 'function' ||
                (this.yy && typeof this.yy.pre_lex === 'function') ||
                (this.yy && typeof this.yy.post_lex === 'function') ||
                typeof this.options.post_lex === 'function' ||
                typeof this.post_lex === 'function'
            ) && typeof this.fastLex === 'function'
        };
        return rv;
    },


    /**
     * backwards compatible alias for `pushState()`;
     * the latter is symmetrical with `popState()` and we advise to use
     * those APIs in any modern lexer code, rather than `begin()`.
     *
     * @public
     * @this {RegExpLexer}
     */
    begin: function lexer_begin(condition) {
        return this.pushState(condition);
    },

    /**
     * activates a new lexer condition state (pushes the new lexer
     * condition state onto the condition stack)
     *
     * @public
     * @this {RegExpLexer}
     */
    pushState: function lexer_pushState(condition) {
        this.conditionStack.push(condition);
        this.__currentRuleSet__ = null;
        return this;
    },

    /**
     * pop the previously active lexer condition state off the condition
     * stack
     *
     * @public
     * @this {RegExpLexer}
     */
    popState: function lexer_popState() {
        const n = this.conditionStack.length - 1;
        if (n > 0) {
            this.__currentRuleSet__ = null;
            return this.conditionStack.pop();
        }
        return this.conditionStack[0];
    },

    /**
     * return the currently active lexer condition state; when an index
     * argument is provided it produces the N-th previous condition state,
     * if available
     *
     * @public
     * @this {RegExpLexer}
     */
    topState: function lexer_topState(n) {
        n = this.conditionStack.length - 1 - Math.abs(n || 0);
        if (n >= 0) {
            return this.conditionStack[n];
        }
        return 'INITIAL';
    },

    /**
     * (internal) determine the lexer rule set which is active for the
     * currently active lexer condition state
     *
     * @public
     * @this {RegExpLexer}
     */
    _currentRules: function lexer__currentRules() {
        const n = this.conditionStack.length - 1;
        let state;
        if (n >= 0) {
            state = this.conditionStack[n];
        } else {
            state = 'INITIAL';
        }
        return this.conditions[state] || this.conditions.INITIAL;
    },

    /**
     * return the number of states currently on the stack
     *
     * @public
     * @this {RegExpLexer}
     */
    stateStackSize: function lexer_stateStackSize() {
        return this.conditionStack.length;
    },
    options: {
  trackPosition: true
},
    JisonLexerError: JisonLexerError,
    performAction: function lexer__performAction(yy, yyrulenumber, YY_START) {
            const yy_ = this;

            /*
    ShEx parser in the Jison parser generator format.
  */

  const UNBOUNDED = -1;

  //const ShExUtil = require("@shexjs/util");
  // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  // WARNING: brutal hack to make example compile and run in minimal jison-gho lexer CLI environment.

  // Common namespaces and entities
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      RDF_TYPE  = RDF + 'type',
      RDF_FIRST = RDF + 'first',
      RDF_REST  = RDF + 'rest',
      RDF_NIL   = RDF + 'nil',
      XSD = 'http://www.w3.org/2001/XMLSchema#',
      XSD_INTEGER  = XSD + 'integer',
      XSD_DECIMAL  = XSD + 'decimal',
      XSD_FLOAT   = XSD + 'float',
      XSD_DOUBLE   = XSD + 'double',
      XSD_BOOLEAN  = XSD + 'boolean',
      XSD_TRUE =  '"true"^^'  + XSD_BOOLEAN,
      XSD_FALSE = '"false"^^' + XSD_BOOLEAN,
      XSD_PATTERN        = XSD + 'pattern',
      XSD_MININCLUSIVE   = XSD + 'minInclusive',
      XSD_MINEXCLUSIVE   = XSD + 'minExclusive',
      XSD_MAXINCLUSIVE   = XSD + 'maxInclusive',
      XSD_MAXEXCLUSIVE   = XSD + 'maxExclusive',
      XSD_LENGTH         = XSD + 'length',
      XSD_MINLENGTH      = XSD + 'minLength',
      XSD_MAXLENGTH      = XSD + 'maxLength',
      XSD_TOTALDIGITS    = XSD + 'totalDigits',
      XSD_FRACTIONDIGITS = XSD + 'fractionDigits';

  const numericDatatypes = [
      XSD + "integer",
      XSD + "decimal",
      XSD + "float",
      XSD + "double",
      XSD + "string",
      XSD + "boolean",
      XSD + "dateTime",
      XSD + "nonPositiveInteger",
      XSD + "negativeInteger",
      XSD + "long",
      XSD + "int",
      XSD + "short",
      XSD + "byte",
      XSD + "nonNegativeInteger",
      XSD + "unsignedLong",
      XSD + "unsignedInt",
      XSD + "unsignedShort",
      XSD + "unsignedByte",
      XSD + "positiveInteger"
  ];

  const absoluteIRI = /^[a-z][a-z0-9+.-]*:/i,
    schemeAuthority = /^(?:([a-z][a-z0-9+.-]*:))?(?:\/\/[^\/]*)?/i,
    dotSegments = /(?:^|\/)\.\.?(?:$|[\/#?])/;

  const numericFacets = ["mininclusive", "minexclusive",
                       "maxinclusive", "maxexclusive"];

  // Returns a lowercase version of the given string
  function lowercase(string) {
    return string.toLowerCase();
  }

  // Appends the item to the array and returns the array
  function appendTo(array, item) {
    return array.push(item), array;
  }

  // Appends the items to the array and returns the array
  function appendAllTo(array, items) {
    return array.push.apply(array, items), array;
  }

  // Extends a base object with properties of other objects
  function extend(base) {
    if (!base) base = {};
    for (let i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
      for (let name in arg)
        base[name] = arg[name];
    return base;
  }

  // Creates an array that contains all items of the given arrays
  function unionAll() {
    let union = [];
    for (let i = 0, l = arguments.length; i < l; i++)
      union = union.concat.apply(union, arguments[i]);
    return union;
  }

  // N3.js:lib/N3Parser.js<0.4.5>:58 with
  //   s/this\./Parser./g
  // ### `_setBase` sets the base IRI to resolve relative IRIs.
  Parser._setBase = function (baseIRI) {
    if (!baseIRI)
      baseIRI = null;

    // baseIRI '#' check disabled to allow -x 'data:text/shex,...#'
    // else if (baseIRI.indexOf('#') >= 0)
    //   throw new Error('Invalid base IRI ' + baseIRI);

    // Set base IRI and its components
    if (Parser._base = baseIRI) {
      Parser._basePath   = baseIRI.replace(/[^\/?]*(?:\?.*)?$/, '');
      baseIRI = baseIRI.match(schemeAuthority);
      Parser._baseRoot   = baseIRI[0];
      Parser._baseScheme = baseIRI[1];
    }
  }

  // N3.js:lib/N3Parser.js<0.4.5>:576 with
  //   s/this\./Parser./g
  //   s/token/iri/
  // ### `_resolveIRI` resolves a relative IRI token against the base path,
  // assuming that a base path has been set and that the IRI is indeed relative.
  function _resolveIRI (iri) {
    switch (iri[0]) {
    // An empty relative IRI indicates the base IRI
    case undefined: return Parser._base;
    // Resolve relative fragment IRIs against the base IRI
    case '#': return Parser._base + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?': return Parser._base.replace(/(?:\?.*)?$/, iri);
    // Resolve root-relative IRIs at the root of the base IRI
    case '/':
      // Resolve scheme-relative IRIs to the scheme
      return (iri[1] === '/' ? Parser._baseScheme : Parser._baseRoot) + _removeDotSegments(iri);
    // Resolve all other IRIs at the base IRI's path
    default: {
      return _removeDotSegments(Parser._basePath + iri);
    }
    }
  }

  // ### `_removeDotSegments` resolves './' and '../' path segments in an IRI as per RFC3986.
  function _removeDotSegments (iri) {
    // Don't modify the IRI if it does not contain any dot segments
    if (!dotSegments.test(iri))
      return iri;

    // Start with an imaginary slash before the IRI in order to resolve trailing './' and '../'
    const length = iri.length;
    let result = '', i = -1, pathStart = -1, next = '/', segmentStart = 0;

    while (i < length) {
      switch (next) {
      // The path starts with the first slash after the authority
      case ':':
        if (pathStart < 0) {
          // Skip two slashes before the authority
          if (iri[++i] === '/' && iri[++i] === '/')
            // Skip to slash after the authority
            while ((pathStart = i + 1) < length && iri[pathStart] !== '/')
              i = pathStart;
        }
        break;
      // Don't modify a query string or fragment
      case '?':
      case '#':
        i = length;
        break;
      // Handle '/.' or '/..' path segments
      case '/':
        if (iri[i + 1] === '.') {
          next = iri[++i + 1];
          switch (next) {
          // Remove a '/.' segment
          case '/':
            result += iri.substring(segmentStart, i - 1);
            segmentStart = i + 1;
            break;
          // Remove a trailing '/.' segment
          case undefined:
          case '?':
          case '#':
            return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
          // Remove a '/..' segment
          case '.':
            next = iri[++i + 1];
            if (next === undefined || next === '/' || next === '?' || next === '#') {
              result += iri.substring(segmentStart, i - 2);
              // Try to remove the parent path from result
              if ((segmentStart = result.lastIndexOf('/')) >= pathStart)
                result = result.substr(0, segmentStart);
              // Remove a trailing '/..' segment
              if (next !== '/')
                return result + '/' + iri.substr(i + 1);
              segmentStart = i + 1;
            }
          }
        }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  }

  // Creates an expression with the given type and attributes
  function expression(expr, attr) {
    const expression = { expression: expr };
    if (attr)
      for (let a in attr)
        expression[a] = attr[a];
    return expression;
  }

  // Creates a path with the given type and items
  function path(type, items) {
    return { type: 'path', pathType: type, items: items };
  }

  // Creates a literal with the given value and type
  function createLiteral(value, type) {
    return { value: value, type: type };
  }

  // Creates a new blank node identifier
  function blank() {
    return '_:b' + blankId++;
  };
  let blankId = 0;
  Parser._resetBlanks = function () { blankId = 0; }
  Parser.reset = function () {
    Parser._prefixes = Parser._imports = Parser._sourceMap = Parser.shapes = Parser.productions = Parser.start = Parser.startActs = null; // Reset state.
    Parser._base = Parser._baseIRI = Parser._baseIRIPath = Parser._baseIRIRoot = null;
  }
  let _fileName; // for debugging
  Parser._setFileName = function (fn) { _fileName = fn; }

  // Regular expression and replacement strings to escape strings
  const stringEscapeReplacements = { '\\': '\\', "'": "'", '"': '"',
                                   't': '\t', 'b': '\b', 'n': '\n', 'r': '\r', 'f': '\f' },
      semactEscapeReplacements = { '\\': '\\', '%': '%' },
      pnameEscapeReplacements = {
        '\\': '\\', "'": "'", '"': '"',
        'n': '\n', 'r': '\r', 't': '\t', 'f': '\f', 'b': '\b',
        '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
        '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';', '=': '=',
        '/': '/', '?': '?', '#': '#', '@': '@', '%': '%',
      };


  // Translates string escape codes in the string into their textual equivalent
  function unescapeString(string, trimLength) {
    string = string.substring(trimLength, string.length - trimLength);
    return { value: ShExUtil.unescapeText(string, stringEscapeReplacements) };
  }

  function unescapeLangString(string, trimLength) {
    const at = string.lastIndexOf("@");
    const lang = string.substr(at);
    string = string.substr(0, at);
    const u = unescapeString(string, trimLength);
    return extend(u, { language: lowercase(lang.substr(1)) });
  }

  // Translates regular expression escape codes in the string into their textual equivalent
  function unescapeRegexp (regexp) {
    const end = regexp.lastIndexOf("/");
    let s = regexp.substr(1, end-1);
    const regexpEscapeReplacements = {
      '.': "\\.", '\\': "\\\\", '?': "\\?", '*': "\\*", '+': "\\+",
      '{': "\\{", '}': "\\}", '(': "\\(", ')': "\\)", '|': "\\|",
      '^': "\\^", '$': "\\$", '[': "\\[", ']': "\\]", '/': "\\/",
      't': '\\t', 'n': '\\n', 'r': '\\r', '-': "\\-", '/': '/'
    };
    s = ShExUtil.unescapeText(s, regexpEscapeReplacements)
    const ret = {
      pattern: s
    };
    if (regexp.length > end+1)
      ret.flags = regexp.substr(end+1);
    return ret;
  }

  // Convenience function to return object with p1 key, value p2
  function keyValObject(key, val) {
    const ret = {};
    ret[key] = val;
    return ret;
  }

  // Return object with p1 key, p2 string value
  function unescapeSemanticAction(key, string) {
    string = string.substring(1, string.length - 2);
    return {
      type: "SemAct",
      name: key,
      code: ShExUtil.unescapeText(string, semactEscapeReplacements)
    };
  }

  function error (e, yy) {
    const hash = {
      text: yy.lexer.match,
      // token: this.terminals_[symbol] || symbol,
      line: yy.lexer.yy_.yylineno,
      loc: yy.lexer.yy_.yylloc,
      // expected: expected
      pos: yy.lexer.showPosition()
    }
    e.hash = hash;
    if (Parser.recoverable) {
      Parser.recoverable(e)
    } else {
      throw e;
      Parser.reset();
    }
  }

  // Expand declared prefix or throw Error
  function expandPrefix (prefix, yy) {
    if (!(prefix in Parser._prefixes))
      error(new Error('Parse error; unknown prefix "' + prefix + ':"'), yy);
    return Parser._prefixes[prefix];
  }

  // Add a shape to the map
  function addShape (label, shape, yy) {
    if (shape === EmptyShape)
      shape = { type: "Shape" };
    if (Parser.productions && label in Parser.productions)
      error(new Error("Structural error: "+label+" is a triple expression"), yy);
    if (!Parser.shapes)
      Parser.shapes = new Map();
    if (label in Parser.shapes) {
      if (Parser.options.duplicateShape === "replace")
        Parser.shapes[label] = shape;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else {
      Parser.shapes[label] = Object.assign({id: label}, shape);
    }
  }

  // Add a production to the map
  function addProduction (label, production, yy) {
    if (Parser.shapes && label in Parser.shapes)
      error(new Error("Structural error: "+label+" is a shape expression"), yy);
    if (!Parser.productions)
      Parser.productions = new Map();
    if (label in Parser.productions) {
      if (Parser.options.duplicateShape === "replace")
        Parser.productions[label] = production;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else
      Parser.productions[label] = production;
  }

  function addSourceMap (obj, yy) {
    if (!Parser._sourceMap)
      Parser._sourceMap = new Map();
    let list = Parser._sourceMap.get(obj)
    if (!list)
      Parser._sourceMap.set(obj, list = []);
    list.push(yy.lexer.yy_.yylloc);
    return obj;
  }

  // shapeJunction judiciously takes a shapeAtom and an optional list of con/disjuncts.
  // No created Shape{And,Or,Not} will have a `nested` shapeExpr.
  // Don't nonest arguments to shapeJunction.
  // shapeAtom emits `nested` so nonest every argument that can be a shapeAtom, i.e.
  //   shapeAtom, inlineShapeAtom, shapeAtomNoRef
  //   {,inline}shape{And,Or,Not}
  //   this does NOT include shapeOrRef or nodeConstraint.
  function shapeJunction (type, shapeAtom, juncts) {
    if (juncts.length === 0) {
      return nonest(shapeAtom);
    } else if (shapeAtom.type === type && !shapeAtom.nested) {
      nonest(shapeAtom).shapeExprs = nonest(shapeAtom).shapeExprs.concat(juncts);
      return shapeAtom;
    } else {
      return { type: type, shapeExprs: [nonest(shapeAtom)].concat(juncts) };
    }
  }

  // strip out .nested attribute
  function nonest (shapeAtom) {
    delete shapeAtom.nested;
    return shapeAtom;
  }

  const EmptyObject = {  };
  const EmptyShape = { type: "Shape" }
const YYSTATE = YY_START;
switch(yyrulenumber) {
case 0 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       \s+|{COMMENT} */ 
 /**/ 
break;
case 3 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       {LANGTAG} */ 
 yy_.yytext = yy_.yytext.substr(1); return 'LANGTAG' 
break;
case 75 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       [a-zA-Z0-9_-]+ */ 
 return 'unexpected word "'+yy_.yytext+'"' 
break;
case 76 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       . */ 
 return 'invalid character '+yy_.yytext 
break;
default:
  return this.simpleCaseActionClusters[yyrulenumber];
}
        },
    simpleCaseActionClusters: {

  /*! Conditions:: INITIAL */ 
  /*! Rule::       {ATPNAME_LN} */ 
   1 : 'ATPNAME_LN',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {ATPNAME_NS} */ 
   2 : 'ATPNAME_NS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       @ */ 
   4 : '@',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {PNAME_LN} */ 
   5 : 'PNAME_LN',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {REPEAT_RANGE} */ 
   6 : 'REPEAT_RANGE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {DOUBLE} */ 
   7 : 'DOUBLE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {DECIMAL} */ 
   8 : 'DECIMAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {INTEGER} */ 
   9 : 'INTEGER',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {ANON} */ 
   10 : 'ANON',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IRIREF} */ 
   11 : 'IRIREF',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {PNAME_NS} */ 
   12 : 'PNAME_NS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       a */ 
   13 : 'a',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {REGEXP} */ 
   14 : 'REGEXP',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {BLANK_NODE_LABEL} */ 
   15 : 'BLANK_NODE_LABEL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {CODE} */ 
   16 : 'CODE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL_LONG1} */ 
   17 : 'LANG_STRING_LITERAL_LONG1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL_LONG2} */ 
   18 : 'LANG_STRING_LITERAL_LONG2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL1} */ 
   19 : 'LANG_STRING_LITERAL1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL2} */ 
   20 : 'LANG_STRING_LITERAL2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL_LONG1} */ 
   21 : 'STRING_LITERAL_LONG1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL_LONG2} */ 
   22 : 'STRING_LITERAL_LONG2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL1} */ 
   23 : 'STRING_LITERAL1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL2} */ 
   24 : 'STRING_LITERAL2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_BASE} */ 
   25 : 'IT_BASE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_PREFIX} */ 
   26 : 'IT_PREFIX',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_IMPORT} */ 
   27 : 'IT_IMPORT',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_START} */ 
   28 : 'IT_start',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_EXTERNAL} */ 
   29 : 'IT_EXTERNAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_CLOSED} */ 
   30 : 'IT_CLOSED',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_EXTRA} */ 
   31 : 'IT_EXTRA',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_LITERAL} */ 
   32 : 'IT_LITERAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_BNODE} */ 
   33 : 'IT_BNODE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_IRI} */ 
   34 : 'IT_IRI',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_NONLITERAL} */ 
   35 : 'IT_NONLITERAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_AND} */ 
   36 : 'IT_AND',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_OR} */ 
   37 : 'IT_OR',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_NOT} */ 
   38 : 'IT_NOT',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MININCLUSIVE} */ 
   39 : 'IT_MININCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MINEXCLUSIVE} */ 
   40 : 'IT_MINEXCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MAXINCLUSIVE} */ 
   41 : 'IT_MAXINCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MAXEXCLUSIVE} */ 
   42 : 'IT_MAXEXCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_LENGTH} */ 
   43 : 'IT_LENGTH',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MINLENGTH} */ 
   44 : 'IT_MINLENGTH',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MAXLENGTH} */ 
   45 : 'IT_MAXLENGTH',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_TOTALDIGITS} */ 
   46 : 'IT_TOTALDIGITS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_FRACTIONDIGITS} */ 
   47 : 'IT_FRACTIONDIGITS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       = */ 
   48 : '=',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \/\/ */ 
   49 : '//',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \{ */ 
   50 : '{',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \} */ 
   51 : '}',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       & */ 
   52 : '&',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \|\| */ 
   53 : '||',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \| */ 
   54 : '|',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       , */ 
   55 : ',',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \( */ 
   56 : '(',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \) */ 
   57 : ')',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \[ */ 
   58 : '[',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \] */ 
   59 : ']',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \$ */ 
   60 : '$',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       ! */ 
   61 : '!',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \^\^ */ 
   62 : '^^',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \^ */ 
   63 : '^',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \. */ 
   64 : '.',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       ~ */ 
   65 : '~',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       ; */ 
   66 : ';',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \* */ 
   67 : '*',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \+ */ 
   68 : '+',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \? */ 
   69 : '?',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       - */ 
   70 : '-',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       % */ 
   71 : '%',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       true */ 
   72 : 'IT_true',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       false */ 
   73 : 'IT_false',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       $ */ 
   74 : 'EOF'
},
    rules: [
        /*  0: */  /^(?:\s+|(#[^\n\r]*|\/\*([^*]|\*([^/]|\\\/))*\*\/))/,
/*  1: */  /^(?:(@(?:(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|:|\d|(?:(?:%(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))|(?:\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.|:|(?:(?:%(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))|(?:\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%))))*))))/,
/*  2: */  /^(?:(@(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)))/,
/*  3: */  /^(?:(@([A-Za-z])+((-([^\W_])+))*))/,
/*  4: */  /^(?:@)/,
/*  5: */  /^(?:((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|:|\d|(?:(?:%(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))|(?:\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.|:|(?:(?:%(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))|(?:\\(_|~|\.|-|!|\$|&|'|\(|\)|\*|\+|,|;|=|\/|\?|#|@|%))))*)))/,
/*  6: */  /^(?:(\{((?:([+-])?(\d)+))((,(((?:([+-])?(\d)+))|\*)?))?\}))/,
/*  7: */  /^(?:(([+-])?(((\d)+\.(\d)*((?:[Ee]([+-])?(\d)+)))|((\.)?(\d)+((?:[Ee]([+-])?(\d)+))))))/,
/*  8: */  /^(?:(([+-])?(\d)*\.(\d)+))/,
/*  9: */  /^(?:(([+-])?(\d)+))/,
/* 10: */  /^(?:{ANON})/,
/* 11: */  /^(?:(<([^\u0000- "<>\\\^`{-}]|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))*>))/,
/* 12: */  /^(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀]))?)?:))/,
/* 13: */  /^(?:a)/,
/* 14: */  /^(?:(\/([^\n\r/\\]|\\[$(-+\--/?\[-\^nrt{-}]|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))+\/[imsx]*))/,
/* 15: */  /^(?:(_:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|\d)(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀])|\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\ufffd]|[\ud800-\udb7f][\udc00-\udfff])|_|_)|-|\d|[·]|[̀-ͯ]|[‿⁀]))?))/,
/* 16: */  /^(?:(\{([^%\\]|\\[%\\]|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))*%\}))/,
/* 17: */  /^(?:('''(('|'')?([^'\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))))*'''(?:@([A-Za-z])+((-([^\W_])+))*)))/,
/* 18: */  /^(?:("""(("|"")?([^"\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))))*"""(?:@([A-Za-z])+((-([^\W_])+))*)))/,
/* 19: */  /^(?:('([^\n\r'\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))*'(?:@([A-Za-z])+((-([^\W_])+))*)))/,
/* 20: */  /^(?:("([^\n\r"\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))*"(?:@([A-Za-z])+((-([^\W_])+))*)))/,
/* 21: */  /^(?:('''(('|'')?([^'\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))))*'''))/,
/* 22: */  /^(?:("""(("|"")?([^"\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f]))))*"""))/,
/* 23: */  /^(?:('([^\n\r'\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))*'))/,
/* 24: */  /^(?:("([^\n\r"\\]|(?:\\["'\\bfnrt])|(?:\\u(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])|\\U(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])(?:\d|[A-F]|[a-f])))*"))/,
/* 25: */  /^(?:([Bb][Aa][Ss][Ee]))/,
/* 26: */  /^(?:([Pp][Rr][Ee][Ff][Ii][Xx]))/,
/* 27: */  /^(?:([Ii][Mm][Pp][Oo][Rr][Tt]))/,
/* 28: */  /^(?:([Ss][Tt][Aa][Rr][Tt]))/,
/* 29: */  /^(?:([Ee][Xx][Tt][Ee][Rr][Nn][Aa][Ll]))/,
/* 30: */  /^(?:([Cc][Ll][Oo][Ss][Ee][Dd]))/,
/* 31: */  /^(?:([Ee][Xx][Tt][Rr][Aa]))/,
/* 32: */  /^(?:([Ll][Ii][Tt][Ee][Rr][Aa][Ll]))/,
/* 33: */  /^(?:([Bb][Nn][Oo][Dd][Ee]))/,
/* 34: */  /^(?:([Ii][Rr][Ii]))/,
/* 35: */  /^(?:([Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]))/,
/* 36: */  /^(?:([Aa][Nn][Dd]))/,
/* 37: */  /^(?:([Oo][Rr]))/,
/* 38: */  /^(?:([No][Oo][Tt]))/,
/* 39: */  /^(?:([Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/,
/* 40: */  /^(?:([Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/,
/* 41: */  /^(?:([Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/,
/* 42: */  /^(?:([Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/,
/* 43: */  /^(?:([Ll][Ee][Nn][Gg][Tt][Hh]))/,
/* 44: */  /^(?:([Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]))/,
/* 45: */  /^(?:([Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]))/,
/* 46: */  /^(?:([Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]))/,
/* 47: */  /^(?:([Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]))/,
/* 48: */  /^(?:=)/,
/* 49: */  /^(?:\/\/)/,
/* 50: */  /^(?:\{)/,
/* 51: */  /^(?:\})/,
/* 52: */  /^(?:&)/,
/* 53: */  /^(?:\|\|)/,
/* 54: */  /^(?:\|)/,
/* 55: */  /^(?:,)/,
/* 56: */  /^(?:\()/,
/* 57: */  /^(?:\))/,
/* 58: */  /^(?:\[)/,
/* 59: */  /^(?:\])/,
/* 60: */  /^(?:\$)/,
/* 61: */  /^(?:!)/,
/* 62: */  /^(?:\^\^)/,
/* 63: */  /^(?:\^)/,
/* 64: */  /^(?:\.)/,
/* 65: */  /^(?:~)/,
/* 66: */  /^(?:;)/,
/* 67: */  /^(?:\*)/,
/* 68: */  /^(?:\+)/,
/* 69: */  /^(?:\?)/,
/* 70: */  /^(?:-)/,
/* 71: */  /^(?:%)/,
/* 72: */  /^(?:true)/,
/* 73: */  /^(?:false)/,
/* 74: */  /^(?:$)/,
/* 75: */  /^(?:[\w\-]+)/,
/* 76: */  /^(?:.)/
    ],
    conditions: {
  "INITIAL": {
    rules: [
      0,
      1,
      2,
      3,
      4,
      5,
      6,
      7,
      8,
      9,
      10,
      11,
      12,
      13,
      14,
      15,
      16,
      17,
      18,
      19,
      20,
      21,
      22,
      23,
      24,
      25,
      26,
      27,
      28,
      29,
      30,
      31,
      32,
      33,
      34,
      35,
      36,
      37,
      38,
      39,
      40,
      41,
      42,
      43,
      44,
      45,
      46,
      47,
      48,
      49,
      50,
      51,
      52,
      53,
      54,
      55,
      56,
      57,
      58,
      59,
      60,
      61,
      62,
      63,
      64,
      65,
      66,
      67,
      68,
      69,
      70,
      71,
      72,
      73,
      74,
      75,
      76
    ],
    inclusive: true
  }
}
};


//=============================================================================
//                     JISON-LEX OPTIONS:

const lexerSpecConglomerate = {
  lexerActionsUseYYLENG: '???',
  lexerActionsUseYYLINENO: '???',
  lexerActionsUseYYTEXT: '???',
  lexerActionsUseYYLOC: '???',
  lexerActionsUseParseError: '???',
  lexerActionsUseYYERROR: '???',
  lexerActionsUseLocationTracking: '???',
  lexerActionsUseMore: '???',
  lexerActionsUseUnput: '???',
  lexerActionsUseReject: '???',
  lexerActionsUseLess: '???',
  lexerActionsUseDisplayAPIs: '???',
  lexerActionsUseDescribeYYLOC: '???',
  lex_rule_dictionary: {
    rules: [
      [
        '\\s+|{COMMENT}',
        '/**/',
      ],
      [
        '{ATPNAME_LN}',
        "return 'ATPNAME_LN'",
      ],
      [
        '{ATPNAME_NS}',
        "return 'ATPNAME_NS'",
      ],
      [
        '{LANGTAG}',
        "yytext = yytext.substr(1); return 'LANGTAG'",
      ],
      [
        '@',
        "return '@'",
      ],
      [
        '{PNAME_LN}',
        "return 'PNAME_LN'",
      ],
      [
        '{REPEAT_RANGE}',
        "return 'REPEAT_RANGE'",
      ],
      [
        '{DOUBLE}',
        "return 'DOUBLE'",
      ],
      [
        '{DECIMAL}',
        "return 'DECIMAL'",
      ],
      [
        '{INTEGER}',
        "return 'INTEGER'",
      ],
      [
        '{ANON}',
        "return 'ANON'",
      ],
      [
        '{IRIREF}',
        "return 'IRIREF'",
      ],
      [
        '{PNAME_NS}',
        "return 'PNAME_NS'",
      ],
      [
        'a',
        "return 'a'",
      ],
      [
        '{REGEXP}',
        "return 'REGEXP'",
      ],
      [
        '{BLANK_NODE_LABEL}',
        "return 'BLANK_NODE_LABEL'",
      ],
      [
        '{CODE}',
        "return 'CODE'",
      ],
      [
        '{LANG_STRING_LITERAL_LONG1}',
        "return 'LANG_STRING_LITERAL_LONG1'",
      ],
      [
        '{LANG_STRING_LITERAL_LONG2}',
        "return 'LANG_STRING_LITERAL_LONG2'",
      ],
      [
        '{LANG_STRING_LITERAL1}',
        "return 'LANG_STRING_LITERAL1'",
      ],
      [
        '{LANG_STRING_LITERAL2}',
        "return 'LANG_STRING_LITERAL2'",
      ],
      [
        '{STRING_LITERAL_LONG1}',
        "return 'STRING_LITERAL_LONG1'",
      ],
      [
        '{STRING_LITERAL_LONG2}',
        "return 'STRING_LITERAL_LONG2'",
      ],
      [
        '{STRING_LITERAL1}',
        "return 'STRING_LITERAL1'",
      ],
      [
        '{STRING_LITERAL2}',
        "return 'STRING_LITERAL2'",
      ],
      [
        '{IT_BASE}',
        "return 'IT_BASE'",
      ],
      [
        '{IT_PREFIX}',
        "return 'IT_PREFIX'",
      ],
      [
        '{IT_IMPORT}',
        "return 'IT_IMPORT'",
      ],
      [
        '{IT_START}',
        "return 'IT_start'",
      ],
      [
        '{IT_EXTERNAL}',
        "return 'IT_EXTERNAL'",
      ],
      [
        '{IT_CLOSED}',
        "return 'IT_CLOSED'",
      ],
      [
        '{IT_EXTRA}',
        "return 'IT_EXTRA'",
      ],
      [
        '{IT_LITERAL}',
        "return 'IT_LITERAL'",
      ],
      [
        '{IT_BNODE}',
        "return 'IT_BNODE'",
      ],
      [
        '{IT_IRI}',
        "return 'IT_IRI'",
      ],
      [
        '{IT_NONLITERAL}',
        "return 'IT_NONLITERAL'",
      ],
      [
        '{IT_AND}',
        "return 'IT_AND'",
      ],
      [
        '{IT_OR}',
        "return 'IT_OR'",
      ],
      [
        '{IT_NOT}',
        "return 'IT_NOT'",
      ],
      [
        '{IT_MININCLUSIVE}',
        "return 'IT_MININCLUSIVE'",
      ],
      [
        '{IT_MINEXCLUSIVE}',
        "return 'IT_MINEXCLUSIVE'",
      ],
      [
        '{IT_MAXINCLUSIVE}',
        "return 'IT_MAXINCLUSIVE'",
      ],
      [
        '{IT_MAXEXCLUSIVE}',
        "return 'IT_MAXEXCLUSIVE'",
      ],
      [
        '{IT_LENGTH}',
        "return 'IT_LENGTH'",
      ],
      [
        '{IT_MINLENGTH}',
        "return 'IT_MINLENGTH'",
      ],
      [
        '{IT_MAXLENGTH}',
        "return 'IT_MAXLENGTH'",
      ],
      [
        '{IT_TOTALDIGITS}',
        "return 'IT_TOTALDIGITS'",
      ],
      [
        '{IT_FRACTIONDIGITS}',
        "return 'IT_FRACTIONDIGITS'",
      ],
      [
        '=',
        "return '='",
      ],
      [
        '\\/\\/',
        "return '//'",
      ],
      [
        '\\{',
        "return '{'",
      ],
      [
        '\\}',
        "return '}'",
      ],
      [
        '&',
        "return '&'",
      ],
      [
        '\\|\\|',
        "return '||'",
      ],
      [
        '\\|',
        "return '|'",
      ],
      [
        ',',
        "return ','",
      ],
      [
        '\\(',
        "return '('",
      ],
      [
        '\\)',
        "return ')'",
      ],
      [
        '\\[',
        "return '['",
      ],
      [
        '\\]',
        "return ']'",
      ],
      [
        '\\$',
        "return '$'",
      ],
      [
        '!',
        "return '!'",
      ],
      [
        '\\^\\^',
        "return '^^'",
      ],
      [
        '\\^',
        "return '^'",
      ],
      [
        '\\.',
        "return '.'",
      ],
      [
        '~',
        "return '~'",
      ],
      [
        ';',
        "return ';'",
      ],
      [
        '\\*',
        "return '*'",
      ],
      [
        '\\+',
        "return '+'",
      ],
      [
        '\\?',
        "return '?'",
      ],
      [
        '-',
        "return '-'",
      ],
      [
        '%',
        "return '%'",
      ],
      [
        'true',
        "return 'IT_true'",
      ],
      [
        'false',
        "return 'IT_false'",
      ],
      [
        '$',
        "return 'EOF'",
      ],
      [
        '[a-zA-Z0-9_-]+',
        `return 'unexpected word "'+yytext+'"'`,
      ],
      [
        '.',
        "return 'invalid character '+yytext",
      ],
    ],
    macros: {
      IT_BASE: '[Bb][Aa][Ss][Ee]',
      IT_PREFIX: '[Pp][Rr][Ee][Ff][Ii][Xx]',
      IT_IMPORT: '[iI][mM][pP][oO][rR][tT]',
      IT_START: '[sS][tT][aA][rR][tT]',
      IT_EXTERNAL: '[eE][xX][tT][eE][rR][nN][aA][lL]',
      IT_CLOSED: '[Cc][Ll][Oo][Ss][Ee][Dd]',
      IT_EXTRA: '[Ee][Xx][Tt][Rr][Aa]',
      IT_LITERAL: '[Ll][Ii][Tt][Ee][Rr][Aa][Ll]',
      IT_BNODE: '[Bb][Nn][Oo][Dd][Ee]',
      IT_IRI: '[Ii][Rr][Ii]',
      IT_NONLITERAL: '[Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]',
      IT_AND: '[Aa][Nn][Dd]',
      IT_OR: '[Oo][Rr]',
      IT_NOT: '[No][Oo][Tt]',
      IT_MININCLUSIVE: '[Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      IT_MINEXCLUSIVE: '[Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      IT_MAXINCLUSIVE: '[Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      IT_MAXEXCLUSIVE: '[Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      IT_LENGTH: '[Ll][Ee][Nn][Gg][Tt][Hh]',
      IT_MINLENGTH: '[Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]',
      IT_MAXLENGTH: '[Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]',
      IT_TOTALDIGITS: '[Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]',
      IT_FRACTIONDIGITS: '[Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]',
      LANGTAG: '@([A-Za-z])+((-([0-9A-Za-z])+))*',
      INTEGER: '([+-])?([0-9])+',
      REPEAT_RANGE: '\\{({INTEGER})((,(({INTEGER})|\\*)?))?\\}',
      DECIMAL: '([+-])?([0-9])*\\.([0-9])+',
      EXPONENT: '[Ee]([+-])?([0-9])+',
      DOUBLE: '([+-])?((([0-9])+\\.([0-9])*({EXPONENT}))|((\\.)?([0-9])+({EXPONENT})))',
      ECHAR: '\\\\[\\"\\\'\\\\bfnrt]',
      WS: '( )|((\\t)|((\\r)|(\\n)))',
      PN_CHARS_BASE: '[A-Z]|[a-z]|[\\u00c0-\\u00d6]|[\\u00d8-\\u00f6]|[\\u00f8-\\u02ff]|[\\u0370-\\u037d]|[\\u037f-\\u1fff]|[\\u200c-\\u200d]|[\\u2070-\\u218f]|[\\u2c00-\\u2fef]|[\\u3001-\\ud7ff]|[\\uf900-\\ufdcf]|[\\ufdf0-\\ufffd]|[\\uD800-\\uDB7F][\\uDC00-\\uDFFF]',
      PN_CHARS_U: '{PN_CHARS_BASE}|_|_',
      PN_CHARS: '{PN_CHARS_U}|-|[0-9]|[\\u00b7]|[\\u0300-\\u036f]|[\\u203f-\\u2040]',
      REGEXP: '\\/([^\\u002f\\u005C\\u000A\\u000D]|\\\\[nrt\\\\|.?*+(){}$\\u002D\\u005B\\u005D\\u005E/]|{UCHAR})+\\/[smix]*',
      BLANK_NODE_LABEL: '_:({PN_CHARS_U}|[0-9])(({PN_CHARS}|\\.)*{PN_CHARS})?',
      PN_PREFIX: '{PN_CHARS_BASE}(({PN_CHARS}|\\.)*{PN_CHARS})?',
      PNAME_NS: '{PN_PREFIX}?:',
      ATPNAME_NS: '@{PNAME_NS}',
      HEX: '[0-9]|[A-F]|[a-f]',
      PERCENT: '%{HEX}{HEX}',
      UCHAR: '\\\\u{HEX}{HEX}{HEX}{HEX}|\\\\U{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}',
      CODE: '\\{([^%\\\\]|\\\\[%\\\\]|{UCHAR})*%\\}',
      STRING_LITERAL1: "'([^\\u0027\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*'",
      STRING_LITERAL2: '"([^\\u0022\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*"',
      STRING_LITERAL_LONG1: `'''(('|'')?([^\\'\\\\]|{ECHAR}|{UCHAR}))*'''`,
      STRING_LITERAL_LONG2: `"""(("|"")?([^\\"\\\\]|{ECHAR}|{UCHAR}))*"""`,
      LANG_STRING_LITERAL1: "'([^\\u0027\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*'{LANGTAG}",
      LANG_STRING_LITERAL2: '"([^\\u0022\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*"{LANGTAG}',
      LANG_STRING_LITERAL_LONG1: `'''(('|'')?([^\\'\\\\]|{ECHAR}|{UCHAR}))*'''{LANGTAG}`,
      LANG_STRING_LITERAL_LONG2: `"""(("|"")?([^\\"\\\\]|{ECHAR}|{UCHAR}))*"""{LANGTAG}`,
      IRIREF: '<([^\\u0000-\\u0020<>\\"{}|^`\\\\]|{UCHAR})*>',
      PN_LOCAL_ESC: "\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%)",
      PLX: '{PERCENT}|{PN_LOCAL_ESC}',
      PN_LOCAL: '({PN_CHARS_U}|:|[0-9]|{PLX})({PN_CHARS}|\\.|:|{PLX})*',
      PNAME_LN: '{PNAME_NS}{PN_LOCAL}',
      ATPNAME_LN: '@{PNAME_LN}',
      COMMENT: '#[^\\u000a\\u000d]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/',
    },
    startConditions: {},
    codeSections: [
      {
        qualifier: 'init',
        include: `// Included by Jison: includes/unicode.helpers.js:

// helper APIs for testing the unicode*.jisonlex lexer specs

// WARNING: this stuff is purely here so the example(s) will pass the default run test. You mileage will be NIL on these!

let predictive_random_seed = 5;

function getSemiRandomNumber() {
	predictive_random_seed = (predictive_random_seed * 31 + 7) % 51;	
	return predictive_random_seed;
}

// these are used in a three-way test in unicode2 spec:
function is_constant(str) {
	return getSemiRandomNumber() % 3 === 1;
}
function is_function(str) {
	return getSemiRandomNumber() % 3 === 2;
}



const FERR_UNTERMINATED_INLINE_COMMENT = 0x0100;
const FKA_COMMA = 0x0101;
const FKA_FIXED_ROW_OR_COLUMN_MARKER = 0x0102;
const FKA_RANGE_MARKER = 0x0103;
const FKW_ADD = 0x0104;
const FKW_ALMOST_EQUAL = 0x0105;
const FKW_ARRAY_CONCATENATION_OPERATOR = 0x0106;
const FKW_BOOLEAN_AND_OPERATOR = 0x0107;
const FKW_BOOLEAN_NOT_OPERATOR = 0x0108;
const FKW_BOOLEAN_OR_OPERATOR = 0x0109;
const FKW_CUBE_OPERATOR = 0x010A;
const FKW_DATA_MARKER = 0x010B;
const FKW_DEGREES_OPERATOR = 0x010C;
const FKW_DIVIDE = 0x010D;
const FKW_DOT = 0x010E;
const FKW_EQUAL = 0x010F;
const FKW_GREATER_OR_EQUAL = 0x0110;
const FKW_GREATER_THAN = 0x0111;
const FKW_IS_IDENTICAL = 0x0112;
const FKW_LESS_OR_EQUAL = 0x0113;
const FKW_LESS_THAN = 0x0114;
const FKW_MODULO_OPERATOR = 0x0115;
const FKW_MULTIPLY = 0x0116;
const FKW_NOT_EQUAL = 0x0117;
const FKW_NOT_IDENTICAL = 0x0118;
const FKW_POWER = 0x0119;
const FKW_PROMILAGE_OPERATOR = 0x011A;
const FKW_SQRT_OPERATOR = 0x011B;
const FKW_SQUARE_OPERATOR = 0x011C;
const FKW_STRING_CONCATENATION_OPERATOR = 0x011D;
const FKW_SUBTRACT = 0x011E;
const FKW_VALUE = 0x011F;

const FT_BOOLEAN = 0x00100000;
const FT_NUMBER = 0x00200000;
const FT_STRING = 0x00400000;

const FU_ANY = 0x00010000;
const FU_DERIVED = 0x00020000;
const FU_STRING = 0x00040000;



class ASTnode {
	constructor(n) {
		this.id = n;
	}

	setLocationInfo(loc) {
		this._yylloc = loc;
		return this;
	}
	setCommentsIndex(n) {
		this._commentIndex = n;
		return this;
	}
    setLexedText(s) {
    	this._lexedText = s;
		return this;
    }
}

class lexerToken extends ASTnode {
	constructor(n) {
		super(n);
	}
}

class ASTcurrency extends ASTnode {
	constructor(v) {
		super('$');
		this._currency = v;
	}
}

class ASTerror extends ASTnode {
	constructor(e, msg) {
		super('E');
		this._errorCode = e;
		this._errorMessage = msg;
	}
}

class ASTopcode extends ASTnode {
	constructor(n) {
		super('C');
		this.opcode = n;
	}
}

class ASTvalue extends ASTnode {
	constructor(v, a) {
		super('V');
		this._value = v;
		this._attributes = a;
	}
}


const symbolHashTable = {};


const parser = {
	getNextCommentIndex() {
		return getSemiRandomNumber();
	}
	dedupQuotedString(s, q) {
		return s;
	}
	deepCopy(loc) {
		// fake a deep clone with a shallow one:
		return Object.assign({}, loc);
	}
	getSymbol4Currency(s) {
		return '$$$' + s;		
	}
	getSymbol4DefinedConstant(s) {
		if (!symbolHashTable[s]) {
			let n = getSemiRandomNumber();
			symbolHashTable[s] = 'S' + n;
		}
		return symbolHashTable[s];
	}
	pushComment() {
		/**/
	}
}


//----------------------------------------------------------------------
//
// ShEx
// 

const ShExUtil = {
	unescapeText(s, delim) {
	  return s;
	}
};

const Parser = {

}

// End Of Include by Jison: includes/unicode.helpers.js`,
      },
    ],
    importDecls: [],
    unknownDecls: [],
    actionInclude: `/*
    ShEx parser in the Jison parser generator format.
  */

  const UNBOUNDED = -1;

  //const ShExUtil = require("@shexjs/util");
  // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  // WARNING: brutal hack to make example compile and run in minimal jison-gho lexer CLI environment.

  // Common namespaces and entities
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      RDF_TYPE  = RDF + 'type',
      RDF_FIRST = RDF + 'first',
      RDF_REST  = RDF + 'rest',
      RDF_NIL   = RDF + 'nil',
      XSD = 'http://www.w3.org/2001/XMLSchema#',
      XSD_INTEGER  = XSD + 'integer',
      XSD_DECIMAL  = XSD + 'decimal',
      XSD_FLOAT   = XSD + 'float',
      XSD_DOUBLE   = XSD + 'double',
      XSD_BOOLEAN  = XSD + 'boolean',
      XSD_TRUE =  '"true"^^'  + XSD_BOOLEAN,
      XSD_FALSE = '"false"^^' + XSD_BOOLEAN,
      XSD_PATTERN        = XSD + 'pattern',
      XSD_MININCLUSIVE   = XSD + 'minInclusive',
      XSD_MINEXCLUSIVE   = XSD + 'minExclusive',
      XSD_MAXINCLUSIVE   = XSD + 'maxInclusive',
      XSD_MAXEXCLUSIVE   = XSD + 'maxExclusive',
      XSD_LENGTH         = XSD + 'length',
      XSD_MINLENGTH      = XSD + 'minLength',
      XSD_MAXLENGTH      = XSD + 'maxLength',
      XSD_TOTALDIGITS    = XSD + 'totalDigits',
      XSD_FRACTIONDIGITS = XSD + 'fractionDigits';

  const numericDatatypes = [
      XSD + "integer",
      XSD + "decimal",
      XSD + "float",
      XSD + "double",
      XSD + "string",
      XSD + "boolean",
      XSD + "dateTime",
      XSD + "nonPositiveInteger",
      XSD + "negativeInteger",
      XSD + "long",
      XSD + "int",
      XSD + "short",
      XSD + "byte",
      XSD + "nonNegativeInteger",
      XSD + "unsignedLong",
      XSD + "unsignedInt",
      XSD + "unsignedShort",
      XSD + "unsignedByte",
      XSD + "positiveInteger"
  ];

  const absoluteIRI = /^[a-z][a-z0-9+.-]*:/i,
    schemeAuthority = /^(?:([a-z][a-z0-9+.-]*:))?(?:\\/\\/[^\\/]*)?/i,
    dotSegments = /(?:^|\\/)\\.\\.?(?:$|[\\/#?])/;

  const numericFacets = ["mininclusive", "minexclusive",
                       "maxinclusive", "maxexclusive"];

  // Returns a lowercase version of the given string
  function lowercase(string) {
    return string.toLowerCase();
  }

  // Appends the item to the array and returns the array
  function appendTo(array, item) {
    return array.push(item), array;
  }

  // Appends the items to the array and returns the array
  function appendAllTo(array, items) {
    return array.push.apply(array, items), array;
  }

  // Extends a base object with properties of other objects
  function extend(base) {
    if (!base) base = {};
    for (let i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
      for (let name in arg)
        base[name] = arg[name];
    return base;
  }

  // Creates an array that contains all items of the given arrays
  function unionAll() {
    let union = [];
    for (let i = 0, l = arguments.length; i < l; i++)
      union = union.concat.apply(union, arguments[i]);
    return union;
  }

  // N3.js:lib/N3Parser.js<0.4.5>:58 with
  //   s/this\\./Parser./g
  // ### \`_setBase\` sets the base IRI to resolve relative IRIs.
  Parser._setBase = function (baseIRI) {
    if (!baseIRI)
      baseIRI = null;

    // baseIRI '#' check disabled to allow -x 'data:text/shex,...#'
    // else if (baseIRI.indexOf('#') >= 0)
    //   throw new Error('Invalid base IRI ' + baseIRI);

    // Set base IRI and its components
    if (Parser._base = baseIRI) {
      Parser._basePath   = baseIRI.replace(/[^\\/?]*(?:\\?.*)?$/, '');
      baseIRI = baseIRI.match(schemeAuthority);
      Parser._baseRoot   = baseIRI[0];
      Parser._baseScheme = baseIRI[1];
    }
  }

  // N3.js:lib/N3Parser.js<0.4.5>:576 with
  //   s/this\\./Parser./g
  //   s/token/iri/
  // ### \`_resolveIRI\` resolves a relative IRI token against the base path,
  // assuming that a base path has been set and that the IRI is indeed relative.
  function _resolveIRI (iri) {
    switch (iri[0]) {
    // An empty relative IRI indicates the base IRI
    case undefined: return Parser._base;
    // Resolve relative fragment IRIs against the base IRI
    case '#': return Parser._base + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?': return Parser._base.replace(/(?:\\?.*)?$/, iri);
    // Resolve root-relative IRIs at the root of the base IRI
    case '/':
      // Resolve scheme-relative IRIs to the scheme
      return (iri[1] === '/' ? Parser._baseScheme : Parser._baseRoot) + _removeDotSegments(iri);
    // Resolve all other IRIs at the base IRI's path
    default: {
      return _removeDotSegments(Parser._basePath + iri);
    }
    }
  }

  // ### \`_removeDotSegments\` resolves './' and '../' path segments in an IRI as per RFC3986.
  function _removeDotSegments (iri) {
    // Don't modify the IRI if it does not contain any dot segments
    if (!dotSegments.test(iri))
      return iri;

    // Start with an imaginary slash before the IRI in order to resolve trailing './' and '../'
    const length = iri.length;
    let result = '', i = -1, pathStart = -1, next = '/', segmentStart = 0;

    while (i < length) {
      switch (next) {
      // The path starts with the first slash after the authority
      case ':':
        if (pathStart < 0) {
          // Skip two slashes before the authority
          if (iri[++i] === '/' && iri[++i] === '/')
            // Skip to slash after the authority
            while ((pathStart = i + 1) < length && iri[pathStart] !== '/')
              i = pathStart;
        }
        break;
      // Don't modify a query string or fragment
      case '?':
      case '#':
        i = length;
        break;
      // Handle '/.' or '/..' path segments
      case '/':
        if (iri[i + 1] === '.') {
          next = iri[++i + 1];
          switch (next) {
          // Remove a '/.' segment
          case '/':
            result += iri.substring(segmentStart, i - 1);
            segmentStart = i + 1;
            break;
          // Remove a trailing '/.' segment
          case undefined:
          case '?':
          case '#':
            return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
          // Remove a '/..' segment
          case '.':
            next = iri[++i + 1];
            if (next === undefined || next === '/' || next === '?' || next === '#') {
              result += iri.substring(segmentStart, i - 2);
              // Try to remove the parent path from result
              if ((segmentStart = result.lastIndexOf('/')) >= pathStart)
                result = result.substr(0, segmentStart);
              // Remove a trailing '/..' segment
              if (next !== '/')
                return result + '/' + iri.substr(i + 1);
              segmentStart = i + 1;
            }
          }
        }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  }

  // Creates an expression with the given type and attributes
  function expression(expr, attr) {
    const expression = { expression: expr };
    if (attr)
      for (let a in attr)
        expression[a] = attr[a];
    return expression;
  }

  // Creates a path with the given type and items
  function path(type, items) {
    return { type: 'path', pathType: type, items: items };
  }

  // Creates a literal with the given value and type
  function createLiteral(value, type) {
    return { value: value, type: type };
  }

  // Creates a new blank node identifier
  function blank() {
    return '_:b' + blankId++;
  };
  let blankId = 0;
  Parser._resetBlanks = function () { blankId = 0; }
  Parser.reset = function () {
    Parser._prefixes = Parser._imports = Parser._sourceMap = Parser.shapes = Parser.productions = Parser.start = Parser.startActs = null; // Reset state.
    Parser._base = Parser._baseIRI = Parser._baseIRIPath = Parser._baseIRIRoot = null;
  }
  let _fileName; // for debugging
  Parser._setFileName = function (fn) { _fileName = fn; }

  // Regular expression and replacement strings to escape strings
  const stringEscapeReplacements = { '\\\\': '\\\\', "'": "'", '"': '"',
                                   't': '\\t', 'b': '\\b', 'n': '\\n', 'r': '\\r', 'f': '\\f' },
      semactEscapeReplacements = { '\\\\': '\\\\', '%': '%' },
      pnameEscapeReplacements = {
        '\\\\': '\\\\', "'": "'", '"': '"',
        'n': '\\n', 'r': '\\r', 't': '\\t', 'f': '\\f', 'b': '\\b',
        '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
        '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';', '=': '=',
        '/': '/', '?': '?', '#': '#', '@': '@', '%': '%',
      };


  // Translates string escape codes in the string into their textual equivalent
  function unescapeString(string, trimLength) {
    string = string.substring(trimLength, string.length - trimLength);
    return { value: ShExUtil.unescapeText(string, stringEscapeReplacements) };
  }

  function unescapeLangString(string, trimLength) {
    const at = string.lastIndexOf("@");
    const lang = string.substr(at);
    string = string.substr(0, at);
    const u = unescapeString(string, trimLength);
    return extend(u, { language: lowercase(lang.substr(1)) });
  }

  // Translates regular expression escape codes in the string into their textual equivalent
  function unescapeRegexp (regexp) {
    const end = regexp.lastIndexOf("/");
    let s = regexp.substr(1, end-1);
    const regexpEscapeReplacements = {
      '.': "\\\\.", '\\\\': "\\\\\\\\", '?': "\\\\?", '*': "\\\\*", '+': "\\\\+",
      '{': "\\\\{", '}': "\\\\}", '(': "\\\\(", ')': "\\\\)", '|': "\\\\|",
      '^': "\\\\^", '$': "\\\\$", '[': "\\\\[", ']': "\\\\]", '/': "\\\\/",
      't': '\\\\t', 'n': '\\\\n', 'r': '\\\\r', '-': "\\\\-", '/': '/'
    };
    s = ShExUtil.unescapeText(s, regexpEscapeReplacements)
    const ret = {
      pattern: s
    };
    if (regexp.length > end+1)
      ret.flags = regexp.substr(end+1);
    return ret;
  }

  // Convenience function to return object with p1 key, value p2
  function keyValObject(key, val) {
    const ret = {};
    ret[key] = val;
    return ret;
  }

  // Return object with p1 key, p2 string value
  function unescapeSemanticAction(key, string) {
    string = string.substring(1, string.length - 2);
    return {
      type: "SemAct",
      name: key,
      code: ShExUtil.unescapeText(string, semactEscapeReplacements)
    };
  }

  function error (e, yy) {
    const hash = {
      text: yy.lexer.match,
      // token: this.terminals_[symbol] || symbol,
      line: yy.lexer.yylineno,
      loc: yy.lexer.yylloc,
      // expected: expected
      pos: yy.lexer.showPosition()
    }
    e.hash = hash;
    if (Parser.recoverable) {
      Parser.recoverable(e)
    } else {
      throw e;
      Parser.reset();
    }
  }

  // Expand declared prefix or throw Error
  function expandPrefix (prefix, yy) {
    if (!(prefix in Parser._prefixes))
      error(new Error('Parse error; unknown prefix "' + prefix + ':"'), yy);
    return Parser._prefixes[prefix];
  }

  // Add a shape to the map
  function addShape (label, shape, yy) {
    if (shape === EmptyShape)
      shape = { type: "Shape" };
    if (Parser.productions && label in Parser.productions)
      error(new Error("Structural error: "+label+" is a triple expression"), yy);
    if (!Parser.shapes)
      Parser.shapes = new Map();
    if (label in Parser.shapes) {
      if (Parser.options.duplicateShape === "replace")
        Parser.shapes[label] = shape;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else {
      Parser.shapes[label] = Object.assign({id: label}, shape);
    }
  }

  // Add a production to the map
  function addProduction (label, production, yy) {
    if (Parser.shapes && label in Parser.shapes)
      error(new Error("Structural error: "+label+" is a shape expression"), yy);
    if (!Parser.productions)
      Parser.productions = new Map();
    if (label in Parser.productions) {
      if (Parser.options.duplicateShape === "replace")
        Parser.productions[label] = production;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else
      Parser.productions[label] = production;
  }

  function addSourceMap (obj, yy) {
    if (!Parser._sourceMap)
      Parser._sourceMap = new Map();
    let list = Parser._sourceMap.get(obj)
    if (!list)
      Parser._sourceMap.set(obj, list = []);
    list.push(yy.lexer.yylloc);
    return obj;
  }

  // shapeJunction judiciously takes a shapeAtom and an optional list of con/disjuncts.
  // No created Shape{And,Or,Not} will have a \`nested\` shapeExpr.
  // Don't nonest arguments to shapeJunction.
  // shapeAtom emits \`nested\` so nonest every argument that can be a shapeAtom, i.e.
  //   shapeAtom, inlineShapeAtom, shapeAtomNoRef
  //   {,inline}shape{And,Or,Not}
  //   this does NOT include shapeOrRef or nodeConstraint.
  function shapeJunction (type, shapeAtom, juncts) {
    if (juncts.length === 0) {
      return nonest(shapeAtom);
    } else if (shapeAtom.type === type && !shapeAtom.nested) {
      nonest(shapeAtom).shapeExprs = nonest(shapeAtom).shapeExprs.concat(juncts);
      return shapeAtom;
    } else {
      return { type: type, shapeExprs: [nonest(shapeAtom)].concat(juncts) };
    }
  }

  // strip out .nested attribute
  function nonest (shapeAtom) {
    delete shapeAtom.nested;
    return shapeAtom;
  }

  const EmptyObject = {  };
  const EmptyShape = { type: "Shape" }`,
  },
  codeSections: [
    {
      qualifier: 'init',
      include: `// Included by Jison: includes/unicode.helpers.js:

// helper APIs for testing the unicode*.jisonlex lexer specs

// WARNING: this stuff is purely here so the example(s) will pass the default run test. You mileage will be NIL on these!

let predictive_random_seed = 5;

function getSemiRandomNumber() {
	predictive_random_seed = (predictive_random_seed * 31 + 7) % 51;	
	return predictive_random_seed;
}

// these are used in a three-way test in unicode2 spec:
function is_constant(str) {
	return getSemiRandomNumber() % 3 === 1;
}
function is_function(str) {
	return getSemiRandomNumber() % 3 === 2;
}



const FERR_UNTERMINATED_INLINE_COMMENT = 0x0100;
const FKA_COMMA = 0x0101;
const FKA_FIXED_ROW_OR_COLUMN_MARKER = 0x0102;
const FKA_RANGE_MARKER = 0x0103;
const FKW_ADD = 0x0104;
const FKW_ALMOST_EQUAL = 0x0105;
const FKW_ARRAY_CONCATENATION_OPERATOR = 0x0106;
const FKW_BOOLEAN_AND_OPERATOR = 0x0107;
const FKW_BOOLEAN_NOT_OPERATOR = 0x0108;
const FKW_BOOLEAN_OR_OPERATOR = 0x0109;
const FKW_CUBE_OPERATOR = 0x010A;
const FKW_DATA_MARKER = 0x010B;
const FKW_DEGREES_OPERATOR = 0x010C;
const FKW_DIVIDE = 0x010D;
const FKW_DOT = 0x010E;
const FKW_EQUAL = 0x010F;
const FKW_GREATER_OR_EQUAL = 0x0110;
const FKW_GREATER_THAN = 0x0111;
const FKW_IS_IDENTICAL = 0x0112;
const FKW_LESS_OR_EQUAL = 0x0113;
const FKW_LESS_THAN = 0x0114;
const FKW_MODULO_OPERATOR = 0x0115;
const FKW_MULTIPLY = 0x0116;
const FKW_NOT_EQUAL = 0x0117;
const FKW_NOT_IDENTICAL = 0x0118;
const FKW_POWER = 0x0119;
const FKW_PROMILAGE_OPERATOR = 0x011A;
const FKW_SQRT_OPERATOR = 0x011B;
const FKW_SQUARE_OPERATOR = 0x011C;
const FKW_STRING_CONCATENATION_OPERATOR = 0x011D;
const FKW_SUBTRACT = 0x011E;
const FKW_VALUE = 0x011F;

const FT_BOOLEAN = 0x00100000;
const FT_NUMBER = 0x00200000;
const FT_STRING = 0x00400000;

const FU_ANY = 0x00010000;
const FU_DERIVED = 0x00020000;
const FU_STRING = 0x00040000;



class ASTnode {
	constructor(n) {
		this.id = n;
	}

	setLocationInfo(loc) {
		this._yylloc = loc;
		return this;
	}
	setCommentsIndex(n) {
		this._commentIndex = n;
		return this;
	}
    setLexedText(s) {
    	this._lexedText = s;
		return this;
    }
}

class lexerToken extends ASTnode {
	constructor(n) {
		super(n);
	}
}

class ASTcurrency extends ASTnode {
	constructor(v) {
		super('$');
		this._currency = v;
	}
}

class ASTerror extends ASTnode {
	constructor(e, msg) {
		super('E');
		this._errorCode = e;
		this._errorMessage = msg;
	}
}

class ASTopcode extends ASTnode {
	constructor(n) {
		super('C');
		this.opcode = n;
	}
}

class ASTvalue extends ASTnode {
	constructor(v, a) {
		super('V');
		this._value = v;
		this._attributes = a;
	}
}


const symbolHashTable = {};


const parser = {
	getNextCommentIndex() {
		return getSemiRandomNumber();
	}
	dedupQuotedString(s, q) {
		return s;
	}
	deepCopy(loc) {
		// fake a deep clone with a shallow one:
		return Object.assign({}, loc);
	}
	getSymbol4Currency(s) {
		return '$$$' + s;		
	}
	getSymbol4DefinedConstant(s) {
		if (!symbolHashTable[s]) {
			let n = getSemiRandomNumber();
			symbolHashTable[s] = 'S' + n;
		}
		return symbolHashTable[s];
	}
	pushComment() {
		/**/
	}
}


//----------------------------------------------------------------------
//
// ShEx
// 

const ShExUtil = {
	unescapeText(s, delim) {
	  return s;
	}
};

const Parser = {

}

// End Of Include by Jison: includes/unicode.helpers.js`,
    },
  ],
  importDecls: [],
  unknownDecls: [],
  options: {
    moduleType: 'commonjs',
    debug: false,
    enableDebugLogs: false,
    json: true,
    noMain: true,
    moduleMain: null,
    moduleMainImports: null,
    dumpSourceCodeOnFailure: true,
    throwErrorOnCompileFailure: true,
    doNotTestCompile: false,
    defaultModuleName: 'lexer',
    xregexp: false,
    lexerErrorsAreRecoverable: false,
    flex: false,
    backtrack_lexer: false,
    ranges: false,
    trackPosition: true,
    caseInsensitive: false,
    exportSourceCode: {
      enabled: false,
    },
    exportAST: false,
    prettyCfg: true,
  },
  conditions: {
    INITIAL: {
      rules: [
        0,
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8,
        9,
        10,
        11,
        12,
        13,
        14,
        15,
        16,
        17,
        18,
        19,
        20,
        21,
        22,
        23,
        24,
        25,
        26,
        27,
        28,
        29,
        30,
        31,
        32,
        33,
        34,
        35,
        36,
        37,
        38,
        39,
        40,
        41,
        42,
        43,
        44,
        45,
        46,
        47,
        48,
        49,
        50,
        51,
        52,
        53,
        54,
        55,
        56,
        57,
        58,
        59,
        60,
        61,
        62,
        63,
        64,
        65,
        66,
        67,
        68,
        69,
        70,
        71,
        72,
        73,
        74,
        75,
        76,
      ],
      inclusive: true,
    },
  },
  performAction: `function lexer__performAction(yy, yyrulenumber, YY_START) {
            const yy_ = this;

            /*
    ShEx parser in the Jison parser generator format.
  */

  const UNBOUNDED = -1;

  //const ShExUtil = require("@shexjs/util");
  // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  // WARNING: brutal hack to make example compile and run in minimal jison-gho lexer CLI environment.

  // Common namespaces and entities
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      RDF_TYPE  = RDF + 'type',
      RDF_FIRST = RDF + 'first',
      RDF_REST  = RDF + 'rest',
      RDF_NIL   = RDF + 'nil',
      XSD = 'http://www.w3.org/2001/XMLSchema#',
      XSD_INTEGER  = XSD + 'integer',
      XSD_DECIMAL  = XSD + 'decimal',
      XSD_FLOAT   = XSD + 'float',
      XSD_DOUBLE   = XSD + 'double',
      XSD_BOOLEAN  = XSD + 'boolean',
      XSD_TRUE =  '"true"^^'  + XSD_BOOLEAN,
      XSD_FALSE = '"false"^^' + XSD_BOOLEAN,
      XSD_PATTERN        = XSD + 'pattern',
      XSD_MININCLUSIVE   = XSD + 'minInclusive',
      XSD_MINEXCLUSIVE   = XSD + 'minExclusive',
      XSD_MAXINCLUSIVE   = XSD + 'maxInclusive',
      XSD_MAXEXCLUSIVE   = XSD + 'maxExclusive',
      XSD_LENGTH         = XSD + 'length',
      XSD_MINLENGTH      = XSD + 'minLength',
      XSD_MAXLENGTH      = XSD + 'maxLength',
      XSD_TOTALDIGITS    = XSD + 'totalDigits',
      XSD_FRACTIONDIGITS = XSD + 'fractionDigits';

  const numericDatatypes = [
      XSD + "integer",
      XSD + "decimal",
      XSD + "float",
      XSD + "double",
      XSD + "string",
      XSD + "boolean",
      XSD + "dateTime",
      XSD + "nonPositiveInteger",
      XSD + "negativeInteger",
      XSD + "long",
      XSD + "int",
      XSD + "short",
      XSD + "byte",
      XSD + "nonNegativeInteger",
      XSD + "unsignedLong",
      XSD + "unsignedInt",
      XSD + "unsignedShort",
      XSD + "unsignedByte",
      XSD + "positiveInteger"
  ];

  const absoluteIRI = /^[a-z][a-z0-9+.-]*:/i,
    schemeAuthority = /^(?:([a-z][a-z0-9+.-]*:))?(?:\\/\\/[^\\/]*)?/i,
    dotSegments = /(?:^|\\/)\\.\\.?(?:$|[\\/#?])/;

  const numericFacets = ["mininclusive", "minexclusive",
                       "maxinclusive", "maxexclusive"];

  // Returns a lowercase version of the given string
  function lowercase(string) {
    return string.toLowerCase();
  }

  // Appends the item to the array and returns the array
  function appendTo(array, item) {
    return array.push(item), array;
  }

  // Appends the items to the array and returns the array
  function appendAllTo(array, items) {
    return array.push.apply(array, items), array;
  }

  // Extends a base object with properties of other objects
  function extend(base) {
    if (!base) base = {};
    for (let i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
      for (let name in arg)
        base[name] = arg[name];
    return base;
  }

  // Creates an array that contains all items of the given arrays
  function unionAll() {
    let union = [];
    for (let i = 0, l = arguments.length; i < l; i++)
      union = union.concat.apply(union, arguments[i]);
    return union;
  }

  // N3.js:lib/N3Parser.js<0.4.5>:58 with
  //   s/this\\./Parser./g
  // ### \`_setBase\` sets the base IRI to resolve relative IRIs.
  Parser._setBase = function (baseIRI) {
    if (!baseIRI)
      baseIRI = null;

    // baseIRI '#' check disabled to allow -x 'data:text/shex,...#'
    // else if (baseIRI.indexOf('#') >= 0)
    //   throw new Error('Invalid base IRI ' + baseIRI);

    // Set base IRI and its components
    if (Parser._base = baseIRI) {
      Parser._basePath   = baseIRI.replace(/[^\\/?]*(?:\\?.*)?$/, '');
      baseIRI = baseIRI.match(schemeAuthority);
      Parser._baseRoot   = baseIRI[0];
      Parser._baseScheme = baseIRI[1];
    }
  }

  // N3.js:lib/N3Parser.js<0.4.5>:576 with
  //   s/this\\./Parser./g
  //   s/token/iri/
  // ### \`_resolveIRI\` resolves a relative IRI token against the base path,
  // assuming that a base path has been set and that the IRI is indeed relative.
  function _resolveIRI (iri) {
    switch (iri[0]) {
    // An empty relative IRI indicates the base IRI
    case undefined: return Parser._base;
    // Resolve relative fragment IRIs against the base IRI
    case '#': return Parser._base + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?': return Parser._base.replace(/(?:\\?.*)?$/, iri);
    // Resolve root-relative IRIs at the root of the base IRI
    case '/':
      // Resolve scheme-relative IRIs to the scheme
      return (iri[1] === '/' ? Parser._baseScheme : Parser._baseRoot) + _removeDotSegments(iri);
    // Resolve all other IRIs at the base IRI's path
    default: {
      return _removeDotSegments(Parser._basePath + iri);
    }
    }
  }

  // ### \`_removeDotSegments\` resolves './' and '../' path segments in an IRI as per RFC3986.
  function _removeDotSegments (iri) {
    // Don't modify the IRI if it does not contain any dot segments
    if (!dotSegments.test(iri))
      return iri;

    // Start with an imaginary slash before the IRI in order to resolve trailing './' and '../'
    const length = iri.length;
    let result = '', i = -1, pathStart = -1, next = '/', segmentStart = 0;

    while (i < length) {
      switch (next) {
      // The path starts with the first slash after the authority
      case ':':
        if (pathStart < 0) {
          // Skip two slashes before the authority
          if (iri[++i] === '/' && iri[++i] === '/')
            // Skip to slash after the authority
            while ((pathStart = i + 1) < length && iri[pathStart] !== '/')
              i = pathStart;
        }
        break;
      // Don't modify a query string or fragment
      case '?':
      case '#':
        i = length;
        break;
      // Handle '/.' or '/..' path segments
      case '/':
        if (iri[i + 1] === '.') {
          next = iri[++i + 1];
          switch (next) {
          // Remove a '/.' segment
          case '/':
            result += iri.substring(segmentStart, i - 1);
            segmentStart = i + 1;
            break;
          // Remove a trailing '/.' segment
          case undefined:
          case '?':
          case '#':
            return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
          // Remove a '/..' segment
          case '.':
            next = iri[++i + 1];
            if (next === undefined || next === '/' || next === '?' || next === '#') {
              result += iri.substring(segmentStart, i - 2);
              // Try to remove the parent path from result
              if ((segmentStart = result.lastIndexOf('/')) >= pathStart)
                result = result.substr(0, segmentStart);
              // Remove a trailing '/..' segment
              if (next !== '/')
                return result + '/' + iri.substr(i + 1);
              segmentStart = i + 1;
            }
          }
        }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  }

  // Creates an expression with the given type and attributes
  function expression(expr, attr) {
    const expression = { expression: expr };
    if (attr)
      for (let a in attr)
        expression[a] = attr[a];
    return expression;
  }

  // Creates a path with the given type and items
  function path(type, items) {
    return { type: 'path', pathType: type, items: items };
  }

  // Creates a literal with the given value and type
  function createLiteral(value, type) {
    return { value: value, type: type };
  }

  // Creates a new blank node identifier
  function blank() {
    return '_:b' + blankId++;
  };
  let blankId = 0;
  Parser._resetBlanks = function () { blankId = 0; }
  Parser.reset = function () {
    Parser._prefixes = Parser._imports = Parser._sourceMap = Parser.shapes = Parser.productions = Parser.start = Parser.startActs = null; // Reset state.
    Parser._base = Parser._baseIRI = Parser._baseIRIPath = Parser._baseIRIRoot = null;
  }
  let _fileName; // for debugging
  Parser._setFileName = function (fn) { _fileName = fn; }

  // Regular expression and replacement strings to escape strings
  const stringEscapeReplacements = { '\\\\': '\\\\', "'": "'", '"': '"',
                                   't': '\\t', 'b': '\\b', 'n': '\\n', 'r': '\\r', 'f': '\\f' },
      semactEscapeReplacements = { '\\\\': '\\\\', '%': '%' },
      pnameEscapeReplacements = {
        '\\\\': '\\\\', "'": "'", '"': '"',
        'n': '\\n', 'r': '\\r', 't': '\\t', 'f': '\\f', 'b': '\\b',
        '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
        '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';', '=': '=',
        '/': '/', '?': '?', '#': '#', '@': '@', '%': '%',
      };


  // Translates string escape codes in the string into their textual equivalent
  function unescapeString(string, trimLength) {
    string = string.substring(trimLength, string.length - trimLength);
    return { value: ShExUtil.unescapeText(string, stringEscapeReplacements) };
  }

  function unescapeLangString(string, trimLength) {
    const at = string.lastIndexOf("@");
    const lang = string.substr(at);
    string = string.substr(0, at);
    const u = unescapeString(string, trimLength);
    return extend(u, { language: lowercase(lang.substr(1)) });
  }

  // Translates regular expression escape codes in the string into their textual equivalent
  function unescapeRegexp (regexp) {
    const end = regexp.lastIndexOf("/");
    let s = regexp.substr(1, end-1);
    const regexpEscapeReplacements = {
      '.': "\\\\.", '\\\\': "\\\\\\\\", '?': "\\\\?", '*': "\\\\*", '+': "\\\\+",
      '{': "\\\\{", '}': "\\\\}", '(': "\\\\(", ')': "\\\\)", '|': "\\\\|",
      '^': "\\\\^", '$': "\\\\$", '[': "\\\\[", ']': "\\\\]", '/': "\\\\/",
      't': '\\\\t', 'n': '\\\\n', 'r': '\\\\r', '-': "\\\\-", '/': '/'
    };
    s = ShExUtil.unescapeText(s, regexpEscapeReplacements)
    const ret = {
      pattern: s
    };
    if (regexp.length > end+1)
      ret.flags = regexp.substr(end+1);
    return ret;
  }

  // Convenience function to return object with p1 key, value p2
  function keyValObject(key, val) {
    const ret = {};
    ret[key] = val;
    return ret;
  }

  // Return object with p1 key, p2 string value
  function unescapeSemanticAction(key, string) {
    string = string.substring(1, string.length - 2);
    return {
      type: "SemAct",
      name: key,
      code: ShExUtil.unescapeText(string, semactEscapeReplacements)
    };
  }

  function error (e, yy) {
    const hash = {
      text: yy.lexer.match,
      // token: this.terminals_[symbol] || symbol,
      line: yy.lexer.yy_.yylineno,
      loc: yy.lexer.yy_.yylloc,
      // expected: expected
      pos: yy.lexer.showPosition()
    }
    e.hash = hash;
    if (Parser.recoverable) {
      Parser.recoverable(e)
    } else {
      throw e;
      Parser.reset();
    }
  }

  // Expand declared prefix or throw Error
  function expandPrefix (prefix, yy) {
    if (!(prefix in Parser._prefixes))
      error(new Error('Parse error; unknown prefix "' + prefix + ':"'), yy);
    return Parser._prefixes[prefix];
  }

  // Add a shape to the map
  function addShape (label, shape, yy) {
    if (shape === EmptyShape)
      shape = { type: "Shape" };
    if (Parser.productions && label in Parser.productions)
      error(new Error("Structural error: "+label+" is a triple expression"), yy);
    if (!Parser.shapes)
      Parser.shapes = new Map();
    if (label in Parser.shapes) {
      if (Parser.options.duplicateShape === "replace")
        Parser.shapes[label] = shape;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else {
      Parser.shapes[label] = Object.assign({id: label}, shape);
    }
  }

  // Add a production to the map
  function addProduction (label, production, yy) {
    if (Parser.shapes && label in Parser.shapes)
      error(new Error("Structural error: "+label+" is a shape expression"), yy);
    if (!Parser.productions)
      Parser.productions = new Map();
    if (label in Parser.productions) {
      if (Parser.options.duplicateShape === "replace")
        Parser.productions[label] = production;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else
      Parser.productions[label] = production;
  }

  function addSourceMap (obj, yy) {
    if (!Parser._sourceMap)
      Parser._sourceMap = new Map();
    let list = Parser._sourceMap.get(obj)
    if (!list)
      Parser._sourceMap.set(obj, list = []);
    list.push(yy.lexer.yy_.yylloc);
    return obj;
  }

  // shapeJunction judiciously takes a shapeAtom and an optional list of con/disjuncts.
  // No created Shape{And,Or,Not} will have a \`nested\` shapeExpr.
  // Don't nonest arguments to shapeJunction.
  // shapeAtom emits \`nested\` so nonest every argument that can be a shapeAtom, i.e.
  //   shapeAtom, inlineShapeAtom, shapeAtomNoRef
  //   {,inline}shape{And,Or,Not}
  //   this does NOT include shapeOrRef or nodeConstraint.
  function shapeJunction (type, shapeAtom, juncts) {
    if (juncts.length === 0) {
      return nonest(shapeAtom);
    } else if (shapeAtom.type === type && !shapeAtom.nested) {
      nonest(shapeAtom).shapeExprs = nonest(shapeAtom).shapeExprs.concat(juncts);
      return shapeAtom;
    } else {
      return { type: type, shapeExprs: [nonest(shapeAtom)].concat(juncts) };
    }
  }

  // strip out .nested attribute
  function nonest (shapeAtom) {
    delete shapeAtom.nested;
    return shapeAtom;
  }

  const EmptyObject = {  };
  const EmptyShape = { type: "Shape" }
const YYSTATE = YY_START;
switch(yyrulenumber) {
case 0 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       \\s+|{COMMENT} */ 
 /**/ 
break;
case 3 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       {LANGTAG} */ 
 yy_.yytext = yy_.yytext.substr(1); return 'LANGTAG' 
break;
case 75 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       [a-zA-Z0-9_-]+ */ 
 return 'unexpected word "'+yy_.yytext+'"' 
break;
case 76 : 
/*! Conditions:: INITIAL */ 
/*! Rule::       . */ 
 return 'invalid character '+yy_.yytext 
break;
default:
  return this.simpleCaseActionClusters[yyrulenumber];
}
        }`,
  caseHelperInclude: `{

  /*! Conditions:: INITIAL */ 
  /*! Rule::       {ATPNAME_LN} */ 
   1 : 'ATPNAME_LN',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {ATPNAME_NS} */ 
   2 : 'ATPNAME_NS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       @ */ 
   4 : '@',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {PNAME_LN} */ 
   5 : 'PNAME_LN',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {REPEAT_RANGE} */ 
   6 : 'REPEAT_RANGE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {DOUBLE} */ 
   7 : 'DOUBLE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {DECIMAL} */ 
   8 : 'DECIMAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {INTEGER} */ 
   9 : 'INTEGER',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {ANON} */ 
   10 : 'ANON',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IRIREF} */ 
   11 : 'IRIREF',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {PNAME_NS} */ 
   12 : 'PNAME_NS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       a */ 
   13 : 'a',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {REGEXP} */ 
   14 : 'REGEXP',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {BLANK_NODE_LABEL} */ 
   15 : 'BLANK_NODE_LABEL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {CODE} */ 
   16 : 'CODE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL_LONG1} */ 
   17 : 'LANG_STRING_LITERAL_LONG1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL_LONG2} */ 
   18 : 'LANG_STRING_LITERAL_LONG2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL1} */ 
   19 : 'LANG_STRING_LITERAL1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {LANG_STRING_LITERAL2} */ 
   20 : 'LANG_STRING_LITERAL2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL_LONG1} */ 
   21 : 'STRING_LITERAL_LONG1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL_LONG2} */ 
   22 : 'STRING_LITERAL_LONG2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL1} */ 
   23 : 'STRING_LITERAL1',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {STRING_LITERAL2} */ 
   24 : 'STRING_LITERAL2',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_BASE} */ 
   25 : 'IT_BASE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_PREFIX} */ 
   26 : 'IT_PREFIX',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_IMPORT} */ 
   27 : 'IT_IMPORT',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_START} */ 
   28 : 'IT_start',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_EXTERNAL} */ 
   29 : 'IT_EXTERNAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_CLOSED} */ 
   30 : 'IT_CLOSED',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_EXTRA} */ 
   31 : 'IT_EXTRA',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_LITERAL} */ 
   32 : 'IT_LITERAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_BNODE} */ 
   33 : 'IT_BNODE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_IRI} */ 
   34 : 'IT_IRI',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_NONLITERAL} */ 
   35 : 'IT_NONLITERAL',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_AND} */ 
   36 : 'IT_AND',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_OR} */ 
   37 : 'IT_OR',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_NOT} */ 
   38 : 'IT_NOT',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MININCLUSIVE} */ 
   39 : 'IT_MININCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MINEXCLUSIVE} */ 
   40 : 'IT_MINEXCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MAXINCLUSIVE} */ 
   41 : 'IT_MAXINCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MAXEXCLUSIVE} */ 
   42 : 'IT_MAXEXCLUSIVE',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_LENGTH} */ 
   43 : 'IT_LENGTH',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MINLENGTH} */ 
   44 : 'IT_MINLENGTH',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_MAXLENGTH} */ 
   45 : 'IT_MAXLENGTH',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_TOTALDIGITS} */ 
   46 : 'IT_TOTALDIGITS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       {IT_FRACTIONDIGITS} */ 
   47 : 'IT_FRACTIONDIGITS',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       = */ 
   48 : '=',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\/\\/ */ 
   49 : '//',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\{ */ 
   50 : '{',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\} */ 
   51 : '}',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       & */ 
   52 : '&',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\|\\| */ 
   53 : '||',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\| */ 
   54 : '|',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       , */ 
   55 : ',',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\( */ 
   56 : '(',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\) */ 
   57 : ')',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\[ */ 
   58 : '[',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\] */ 
   59 : ']',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\$ */ 
   60 : '$',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       ! */ 
   61 : '!',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\^\\^ */ 
   62 : '^^',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\^ */ 
   63 : '^',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\. */ 
   64 : '.',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       ~ */ 
   65 : '~',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       ; */ 
   66 : ';',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\* */ 
   67 : '*',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\+ */ 
   68 : '+',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       \\? */ 
   69 : '?',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       - */ 
   70 : '-',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       % */ 
   71 : '%',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       true */ 
   72 : 'IT_true',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       false */ 
   73 : 'IT_false',
  /*! Conditions:: INITIAL */ 
  /*! Rule::       $ */ 
   74 : 'EOF'
}`,
  rules: [
    {
      re: '/^(?:\\s+|(#[^\\n\\r]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/))/',
      source: '^(?:\\s+|(#[^\\n\\r]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\s+|(#[^\\n\\r]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: "/^(?:(@(?:(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*))))/",
      source: "^(?:(@(?:(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*))))",
      flags: '',
      xregexp: {
        captureNames: null,
        source: "^(?:(@(?:(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*))))",
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(@(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)))/',
      source: '^(?:(@(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(@(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(@([A-Za-z])+((-([^\\W_])+))*))/',
      source: '^(?:(@([A-Za-z])+((-([^\\W_])+))*))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(@([A-Za-z])+((-([^\\W_])+))*))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:@)/',
      source: '^(?:@)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:@)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: "/^(?:((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*)))/",
      source: "^(?:((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*)))",
      flags: '',
      xregexp: {
        captureNames: null,
        source: "^(?:((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*)))",
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(\\{((?:([+-])?(\\d)+))((,(((?:([+-])?(\\d)+))|\\*)?))?\\}))/',
      source: '^(?:(\\{((?:([+-])?(\\d)+))((,(((?:([+-])?(\\d)+))|\\*)?))?\\}))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(\\{((?:([+-])?(\\d)+))((,(((?:([+-])?(\\d)+))|\\*)?))?\\}))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(([+-])?(((\\d)+\\.(\\d)*((?:[Ee]([+-])?(\\d)+)))|((\\.)?(\\d)+((?:[Ee]([+-])?(\\d)+))))))/',
      source: '^(?:(([+-])?(((\\d)+\\.(\\d)*((?:[Ee]([+-])?(\\d)+)))|((\\.)?(\\d)+((?:[Ee]([+-])?(\\d)+))))))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(([+-])?(((\\d)+\\.(\\d)*((?:[Ee]([+-])?(\\d)+)))|((\\.)?(\\d)+((?:[Ee]([+-])?(\\d)+))))))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(([+-])?(\\d)*\\.(\\d)+))/',
      source: '^(?:(([+-])?(\\d)*\\.(\\d)+))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(([+-])?(\\d)*\\.(\\d)+))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(([+-])?(\\d)+))/',
      source: '^(?:(([+-])?(\\d)+))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(([+-])?(\\d)+))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:{ANON})/',
      source: '^(?:{ANON})',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:{ANON})',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(<([^\\u0000- "<>\\\\\\^`{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*>))/',
      source: '^(?:(<([^\\u0000- "<>\\\\\\^`{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*>))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(<([^\\u0000- "<>\\\\\\^`{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*>))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:))/',
      source: '^(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:a)/',
      source: '^(?:a)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:a)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(\\/([^\\n\\r/\\\\]|\\\\[$(-+\\--/?\\[-\\^nrt{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))+\\/[imsx]*))/',
      source: '^(?:(\\/([^\\n\\r/\\\\]|\\\\[$(-+\\--/?\\[-\\^nrt{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))+\\/[imsx]*))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(\\/([^\\n\\r/\\\\]|\\\\[$(-+\\--/?\\[-\\^nrt{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))+\\/[imsx]*))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(_:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|\\d)(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?))/',
      source: '^(?:(_:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|\\d)(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(_:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|\\d)(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:(\\{([^%\\\\]|\\\\[%\\\\]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*%\\}))/',
      source: '^(?:(\\{([^%\\\\]|\\\\[%\\\\]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*%\\}))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:(\\{([^%\\\\]|\\\\[%\\\\]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*%\\}))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:('''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''(?:@([A-Za-z])+((-([^\\W_])+))*)))/`,
      source: `^(?:('''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:('''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:("""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""(?:@([A-Za-z])+((-([^\\W_])+))*)))/`,
      source: `^(?:("""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:("""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:('([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'(?:@([A-Za-z])+((-([^\\W_])+))*)))/`,
      source: `^(?:('([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:('([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:("([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"(?:@([A-Za-z])+((-([^\\W_])+))*)))/`,
      source: `^(?:("([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:("([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"(?:@([A-Za-z])+((-([^\\W_])+))*)))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:('''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''))/`,
      source: `^(?:('''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:('''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:("""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""))/`,
      source: `^(?:("""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:("""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:('([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'))/`,
      source: `^(?:('([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:('([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: `/^(?:("([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"))/`,
      source: `^(?:("([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"))`,
      flags: '',
      xregexp: {
        captureNames: null,
        source: `^(?:("([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"))`,
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Bb][Aa][Ss][Ee]))/',
      source: '^(?:([Bb][Aa][Ss][Ee]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Bb][Aa][Ss][Ee]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Pp][Rr][Ee][Ff][Ii][Xx]))/',
      source: '^(?:([Pp][Rr][Ee][Ff][Ii][Xx]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Pp][Rr][Ee][Ff][Ii][Xx]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ii][Mm][Pp][Oo][Rr][Tt]))/',
      source: '^(?:([Ii][Mm][Pp][Oo][Rr][Tt]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ii][Mm][Pp][Oo][Rr][Tt]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ss][Tt][Aa][Rr][Tt]))/',
      source: '^(?:([Ss][Tt][Aa][Rr][Tt]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ss][Tt][Aa][Rr][Tt]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ee][Xx][Tt][Ee][Rr][Nn][Aa][Ll]))/',
      source: '^(?:([Ee][Xx][Tt][Ee][Rr][Nn][Aa][Ll]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ee][Xx][Tt][Ee][Rr][Nn][Aa][Ll]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Cc][Ll][Oo][Ss][Ee][Dd]))/',
      source: '^(?:([Cc][Ll][Oo][Ss][Ee][Dd]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Cc][Ll][Oo][Ss][Ee][Dd]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ee][Xx][Tt][Rr][Aa]))/',
      source: '^(?:([Ee][Xx][Tt][Rr][Aa]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ee][Xx][Tt][Rr][Aa]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ll][Ii][Tt][Ee][Rr][Aa][Ll]))/',
      source: '^(?:([Ll][Ii][Tt][Ee][Rr][Aa][Ll]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ll][Ii][Tt][Ee][Rr][Aa][Ll]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Bb][Nn][Oo][Dd][Ee]))/',
      source: '^(?:([Bb][Nn][Oo][Dd][Ee]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Bb][Nn][Oo][Dd][Ee]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ii][Rr][Ii]))/',
      source: '^(?:([Ii][Rr][Ii]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ii][Rr][Ii]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]))/',
      source: '^(?:([Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Aa][Nn][Dd]))/',
      source: '^(?:([Aa][Nn][Dd]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Aa][Nn][Dd]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Oo][Rr]))/',
      source: '^(?:([Oo][Rr]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Oo][Rr]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([No][Oo][Tt]))/',
      source: '^(?:([No][Oo][Tt]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([No][Oo][Tt]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/',
      source: '^(?:([Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/',
      source: '^(?:([Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/',
      source: '^(?:([Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))/',
      source: '^(?:([Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ll][Ee][Nn][Gg][Tt][Hh]))/',
      source: '^(?:([Ll][Ee][Nn][Gg][Tt][Hh]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ll][Ee][Nn][Gg][Tt][Hh]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]))/',
      source: '^(?:([Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]))/',
      source: '^(?:([Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]))/',
      source: '^(?:([Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:([Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]))/',
      source: '^(?:([Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:([Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:=)/',
      source: '^(?:=)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:=)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\/\\/)/',
      source: '^(?:\\/\\/)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\/\\/)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\{)/',
      source: '^(?:\\{)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\{)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\})/',
      source: '^(?:\\})',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\})',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:&)/',
      source: '^(?:&)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:&)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\|\\|)/',
      source: '^(?:\\|\\|)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\|\\|)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\|)/',
      source: '^(?:\\|)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\|)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:,)/',
      source: '^(?:,)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:,)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\()/',
      source: '^(?:\\()',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\()',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\))/',
      source: '^(?:\\))',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\))',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\[)/',
      source: '^(?:\\[)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\[)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\])/',
      source: '^(?:\\])',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\])',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\$)/',
      source: '^(?:\\$)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\$)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:!)/',
      source: '^(?:!)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:!)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\^\\^)/',
      source: '^(?:\\^\\^)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\^\\^)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\^)/',
      source: '^(?:\\^)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\^)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\.)/',
      source: '^(?:\\.)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\.)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:~)/',
      source: '^(?:~)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:~)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:;)/',
      source: '^(?:;)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:;)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\*)/',
      source: '^(?:\\*)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\*)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\+)/',
      source: '^(?:\\+)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\+)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:\\?)/',
      source: '^(?:\\?)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:\\?)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:-)/',
      source: '^(?:-)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:-)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:%)/',
      source: '^(?:%)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:%)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:true)/',
      source: '^(?:true)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:true)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:false)/',
      source: '^(?:false)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:false)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:$)/',
      source: '^(?:$)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:$)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:[\\w\\-]+)/',
      source: '^(?:[\\w\\-]+)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:[\\w\\-]+)',
        flags: '',
        isNative: true,
      },
    },
    {
      re: '/^(?:.)/',
      source: '^(?:.)',
      flags: '',
      xregexp: {
        captureNames: null,
        source: '^(?:.)',
        flags: '',
        isNative: true,
      },
    },
  ],
  macros: {
    IT_BASE: {
      in_set: 'Bb',
      elsewhere: '[Bb][Aa][Ss][Ee]',
      raw: '[Bb][Aa][Ss][Ee]',
    },
    IT_PREFIX: {
      in_set: 'Pp',
      elsewhere: '[Pp][Rr][Ee][Ff][Ii][Xx]',
      raw: '[Pp][Rr][Ee][Ff][Ii][Xx]',
    },
    IT_IMPORT: {
      in_set: 'Ii',
      elsewhere: '[Ii][Mm][Pp][Oo][Rr][Tt]',
      raw: '[iI][mM][pP][oO][rR][tT]',
    },
    IT_START: {
      in_set: 'Ss',
      elsewhere: '[Ss][Tt][Aa][Rr][Tt]',
      raw: '[sS][tT][aA][rR][tT]',
    },
    IT_EXTERNAL: {
      in_set: 'Ee',
      elsewhere: '[Ee][Xx][Tt][Ee][Rr][Nn][Aa][Ll]',
      raw: '[eE][xX][tT][eE][rR][nN][aA][lL]',
    },
    IT_CLOSED: {
      in_set: 'Cc',
      elsewhere: '[Cc][Ll][Oo][Ss][Ee][Dd]',
      raw: '[Cc][Ll][Oo][Ss][Ee][Dd]',
    },
    IT_EXTRA: {
      in_set: 'Ee',
      elsewhere: '[Ee][Xx][Tt][Rr][Aa]',
      raw: '[Ee][Xx][Tt][Rr][Aa]',
    },
    IT_LITERAL: {
      in_set: 'Ll',
      elsewhere: '[Ll][Ii][Tt][Ee][Rr][Aa][Ll]',
      raw: '[Ll][Ii][Tt][Ee][Rr][Aa][Ll]',
    },
    IT_BNODE: {
      in_set: 'Bb',
      elsewhere: '[Bb][Nn][Oo][Dd][Ee]',
      raw: '[Bb][Nn][Oo][Dd][Ee]',
    },
    IT_IRI: {
      in_set: 'Ii',
      elsewhere: '[Ii][Rr][Ii]',
      raw: '[Ii][Rr][Ii]',
    },
    IT_NONLITERAL: {
      in_set: 'Nn',
      elsewhere: '[Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]',
      raw: '[Nn][Oo][Nn][Ll][Ii][Tt][Ee][Rr][Aa][Ll]',
    },
    IT_AND: {
      in_set: 'Aa',
      elsewhere: '[Aa][Nn][Dd]',
      raw: '[Aa][Nn][Dd]',
    },
    IT_OR: {
      in_set: 'Oo',
      elsewhere: '[Oo][Rr]',
      raw: '[Oo][Rr]',
    },
    IT_NOT: {
      in_set: 'No',
      elsewhere: '[No][Oo][Tt]',
      raw: '[No][Oo][Tt]',
    },
    IT_MININCLUSIVE: {
      in_set: 'Mm',
      elsewhere: '[Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      raw: '[Mm][Ii][Nn][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
    },
    IT_MINEXCLUSIVE: {
      in_set: 'Mm',
      elsewhere: '[Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      raw: '[Mm][Ii][Nn][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
    },
    IT_MAXINCLUSIVE: {
      in_set: 'Mm',
      elsewhere: '[Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      raw: '[Mm][Aa][Xx][Ii][Nn][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
    },
    IT_MAXEXCLUSIVE: {
      in_set: 'Mm',
      elsewhere: '[Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
      raw: '[Mm][Aa][Xx][Ee][Xx][Cc][Ll][Uu][Ss][Ii][Vv][Ee]',
    },
    IT_LENGTH: {
      in_set: 'Ll',
      elsewhere: '[Ll][Ee][Nn][Gg][Tt][Hh]',
      raw: '[Ll][Ee][Nn][Gg][Tt][Hh]',
    },
    IT_MINLENGTH: {
      in_set: 'Mm',
      elsewhere: '[Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]',
      raw: '[Mm][Ii][Nn][Ll][Ee][Nn][Gg][Tt][Hh]',
    },
    IT_MAXLENGTH: {
      in_set: 'Mm',
      elsewhere: '[Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]',
      raw: '[Mm][Aa][Xx][Ll][Ee][Nn][Gg][Tt][Hh]',
    },
    IT_TOTALDIGITS: {
      in_set: 'Tt',
      elsewhere: '[Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]',
      raw: '[Tt][Oo][Tt][Aa][Ll][Dd][Ii][Gg][Ii][Tt][Ss]',
    },
    IT_FRACTIONDIGITS: {
      in_set: 'Ff',
      elsewhere: '[Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]',
      raw: '[Ff][Rr][Aa][Cc][Tt][Ii][Oo][Nn][Dd][Ii][Gg][Ii][Tt][Ss]',
    },
    LANGTAG: {
      in_set: {
        message: '[macro [LANGTAG] is unsuitable for use inside regex set expressions: "[@([A-Za-z])+((-([0-9A-Za-z])+))*]"]',
        name: 'Error',
      },
      elsewhere: '@([A-Za-z])+((-([^\\W_])+))*',
      raw: '@([A-Za-z])+((-([0-9A-Za-z])+))*',
    },
    INTEGER: {
      in_set: {
        message: '[macro [INTEGER] is unsuitable for use inside regex set expressions: "[([+-])?([0-9])+]"]',
        name: 'Error',
      },
      elsewhere: '([+-])?(\\d)+',
      raw: '([+-])?([0-9])+',
    },
    REPEAT_RANGE: {
      in_set: {
        message: '[macro [INTEGER] is unsuitable for use inside regex set expressions: "[([+-])?([0-9])+]"]',
        name: 'Error',
      },
      elsewhere: '\\{((?:([+-])?(\\d)+))((,(((?:([+-])?(\\d)+))|\\*)?))?\\}',
      raw: '\\{({INTEGER})((,(({INTEGER})|\\*)?))?\\}',
    },
    DECIMAL: {
      in_set: {
        message: '[macro [DECIMAL] is unsuitable for use inside regex set expressions: "[([+-])?([0-9])*\\.([0-9])+]"]',
        name: 'Error',
      },
      elsewhere: '([+-])?(\\d)*\\.(\\d)+',
      raw: '([+-])?([0-9])*\\.([0-9])+',
    },
    EXPONENT: {
      in_set: {
        message: '[macro [EXPONENT] is unsuitable for use inside regex set expressions: "[[Ee]([+-])?([0-9])+]"]',
        name: 'Error',
      },
      elsewhere: '[Ee]([+-])?(\\d)+',
      raw: '[Ee]([+-])?([0-9])+',
    },
    DOUBLE: {
      in_set: {
        message: '[macro [EXPONENT] is unsuitable for use inside regex set expressions: "[[Ee]([+-])?([0-9])+]"]',
        name: 'Error',
      },
      elsewhere: '([+-])?(((\\d)+\\.(\\d)*((?:[Ee]([+-])?(\\d)+)))|((\\.)?(\\d)+((?:[Ee]([+-])?(\\d)+))))',
      raw: '([+-])?((([0-9])+\\.([0-9])*({EXPONENT}))|((\\.)?([0-9])+({EXPONENT})))',
    },
    ECHAR: {
      in_set: '\\\\',
      elsewhere: '\\\\["\'\\\\bfnrt]',
      raw: '\\\\[\\"\\\'\\\\bfnrt]',
    },
    WS: {
      in_set: {
        message: '[macro [WS] is unsuitable for use inside regex set expressions: "[( )|((\\t)|((\\r)|(\\n)))]"]',
        name: 'Error',
      },
      elsewhere: '( )|((\\t)|((\\r)|(\\n)))',
      raw: '( )|((\\t)|((\\r)|(\\n)))',
    },
    PN_CHARS_BASE: {
      in_set: 'A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-\\udb7f豈-﷏ﷰ-\\ufffd',
      elsewhere: '[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff]',
      raw: '[A-Z]|[a-z]|[\\u00c0-\\u00d6]|[\\u00d8-\\u00f6]|[\\u00f8-\\u02ff]|[\\u0370-\\u037d]|[\\u037f-\\u1fff]|[\\u200c-\\u200d]|[\\u2070-\\u218f]|[\\u2c00-\\u2fef]|[\\u3001-\\ud7ff]|[\\uf900-\\ufdcf]|[\\ufdf0-\\ufffd]|[\\uD800-\\uDB7F][\\uDC00-\\uDFFF]',
    },
    PN_CHARS_U: {
      in_set: 'A_',
      elsewhere: '(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_',
      raw: '{PN_CHARS_BASE}|_|_',
    },
    PN_CHARS: {
      in_set: '\\-0-9A·̀-ͯ‿⁀',
      elsewhere: '(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]',
      raw: '{PN_CHARS_U}|-|[0-9]|[\\u00b7]|[\\u0300-\\u036f]|[\\u203f-\\u2040]',
    },
    REGEXP: {
      in_set: {
        message: '[macro [REGEXP] is unsuitable for use inside regex set expressions: "[\\/([^\\u002f\\u005C\\u000A\\u000D]|\\\\[nrt\\\\|.?*+(){}$\\u002D\\u005B\\u005D\\u005E/]|\\\\)+\\/[smix]*]"]',
        name: 'Error',
      },
      elsewhere: '\\/([^\\n\\r/\\\\]|\\\\[$(-+\\--/?\\[-\\^nrt{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))+\\/[imsx]*',
      raw: '\\/([^\\u002f\\u005C\\u000A\\u000D]|\\\\[nrt\\\\|.?*+(){}$\\u002D\\u005B\\u005D\\u005E/]|{UCHAR})+\\/[smix]*',
    },
    UCHAR: {
      in_set: '\\\\',
      elsewhere: '\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])',
      raw: '\\\\u{HEX}{HEX}{HEX}{HEX}|\\\\U{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}{HEX}',
    },
    HEX: {
      in_set: '0-9A-Fa-f',
      elsewhere: '\\d|[A-F]|[a-f]',
      raw: '[0-9]|[A-F]|[a-f]',
    },
    BLANK_NODE_LABEL: {
      in_set: {
        message: '[macro [BLANK_NODE_LABEL] is unsuitable for use inside regex set expressions: "[_:(A_|[0-9])((\\-0-9A·̀-ͯ‿⁀|\\.)*\\-0-9A·̀-ͯ‿⁀)?]"]',
        name: 'Error',
      },
      elsewhere: '_:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|\\d)(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?',
      raw: '_:({PN_CHARS_U}|[0-9])(({PN_CHARS}|\\.)*{PN_CHARS})?',
    },
    PN_PREFIX: {
      in_set: {
        message: '[macro [PN_PREFIX] is unsuitable for use inside regex set expressions: "[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-\\udb7f豈-﷏ﷰ-\\ufffd((\\-0-9A·̀-ͯ‿⁀|\\.)*\\-0-9A·̀-ͯ‿⁀)?]"]',
        name: 'Error',
      },
      elsewhere: '(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?',
      raw: '{PN_CHARS_BASE}(({PN_CHARS}|\\.)*{PN_CHARS})?',
    },
    PNAME_NS: {
      in_set: {
        message: '[macro [PN_PREFIX] is unsuitable for use inside regex set expressions: "[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-\\udb7f豈-﷏ﷰ-\\ufffd((\\-0-9A·̀-ͯ‿⁀|\\.)*\\-0-9A·̀-ͯ‿⁀)?]"]',
        name: 'Error',
      },
      elsewhere: '(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:',
      raw: '{PN_PREFIX}?:',
    },
    ATPNAME_NS: {
      in_set: {
        message: '[macro [PN_PREFIX] is unsuitable for use inside regex set expressions: "[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-\\udb7f豈-﷏ﷰ-\\ufffd((\\-0-9A·̀-ͯ‿⁀|\\.)*\\-0-9A·̀-ͯ‿⁀)?]"]',
        name: 'Error',
      },
      elsewhere: '@(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)',
      raw: '@{PNAME_NS}',
    },
    PERCENT: {
      in_set: '%',
      elsewhere: '%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])',
      raw: '%{HEX}{HEX}',
    },
    CODE: {
      in_set: {
        message: '[macro [CODE] is unsuitable for use inside regex set expressions: "[\\{([^%\\\\]|\\\\[%\\\\]|\\\\)*%\\}]"]',
        name: 'Error',
      },
      elsewhere: '\\{([^%\\\\]|\\\\[%\\\\]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*%\\}',
      raw: '\\{([^%\\\\]|\\\\[%\\\\]|{UCHAR})*%\\}',
    },
    STRING_LITERAL1: {
      in_set: {
        message: `[macro [STRING_LITERAL1] is unsuitable for use inside regex set expressions: "['([^\\u0027\\u005c\\u000a\\u000d]|\\\\|\\\\)*']"]`,
        name: 'Error',
      },
      elsewhere: `'([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'`,
      raw: "'([^\\u0027\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*'",
    },
    STRING_LITERAL2: {
      in_set: {
        message: `[macro [STRING_LITERAL2] is unsuitable for use inside regex set expressions: "["([^\\u0022\\u005c\\u000a\\u000d]|\\\\|\\\\)*"]"]`,
        name: 'Error',
      },
      elsewhere: `"([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"`,
      raw: '"([^\\u0022\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*"',
    },
    STRING_LITERAL_LONG1: {
      in_set: {
        message: `[macro [STRING_LITERAL_LONG1] is unsuitable for use inside regex set expressions: "['''(('|'')?([^\\'\\\\]|\\\\|\\\\))*''']"]`,
        name: 'Error',
      },
      elsewhere: `'''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''`,
      raw: `'''(('|'')?([^\\'\\\\]|{ECHAR}|{UCHAR}))*'''`,
    },
    STRING_LITERAL_LONG2: {
      in_set: {
        message: `[macro [STRING_LITERAL_LONG2] is unsuitable for use inside regex set expressions: "["""(("|"")?([^\\"\\\\]|\\\\|\\\\))*"""]"]`,
        name: 'Error',
      },
      elsewhere: `"""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""`,
      raw: `"""(("|"")?([^\\"\\\\]|{ECHAR}|{UCHAR}))*"""`,
    },
    LANG_STRING_LITERAL1: {
      in_set: {
        message: '[macro [LANGTAG] is unsuitable for use inside regex set expressions: "[@([A-Za-z])+((-([0-9A-Za-z])+))*]"]',
        name: 'Error',
      },
      elsewhere: `'([^\\n\\r'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*'(?:@([A-Za-z])+((-([^\\W_])+))*)`,
      raw: "'([^\\u0027\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*'{LANGTAG}",
    },
    LANG_STRING_LITERAL2: {
      in_set: {
        message: '[macro [LANGTAG] is unsuitable for use inside regex set expressions: "[@([A-Za-z])+((-([0-9A-Za-z])+))*]"]',
        name: 'Error',
      },
      elsewhere: `"([^\\n\\r"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*"(?:@([A-Za-z])+((-([^\\W_])+))*)`,
      raw: '"([^\\u0022\\u005c\\u000a\\u000d]|{ECHAR}|{UCHAR})*"{LANGTAG}',
    },
    LANG_STRING_LITERAL_LONG1: {
      in_set: {
        message: '[macro [LANGTAG] is unsuitable for use inside regex set expressions: "[@([A-Za-z])+((-([0-9A-Za-z])+))*]"]',
        name: 'Error',
      },
      elsewhere: `'''(('|'')?([^'\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*'''(?:@([A-Za-z])+((-([^\\W_])+))*)`,
      raw: `'''(('|'')?([^\\'\\\\]|{ECHAR}|{UCHAR}))*'''{LANGTAG}`,
    },
    LANG_STRING_LITERAL_LONG2: {
      in_set: {
        message: '[macro [LANGTAG] is unsuitable for use inside regex set expressions: "[@([A-Za-z])+((-([0-9A-Za-z])+))*]"]',
        name: 'Error',
      },
      elsewhere: `"""(("|"")?([^"\\\\]|(?:\\\\["'\\\\bfnrt])|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))))*"""(?:@([A-Za-z])+((-([^\\W_])+))*)`,
      raw: `"""(("|"")?([^\\"\\\\]|{ECHAR}|{UCHAR}))*"""{LANGTAG}`,
    },
    IRIREF: {
      in_set: {
        message: '[macro [IRIREF] is unsuitable for use inside regex set expressions: "[<([^\\u0000-\\u0020<>\\"{}|^`\\\\]|\\\\)*>]"]',
        name: 'Error',
      },
      elsewhere: '<([^\\u0000- "<>\\\\\\^`{-}]|(?:\\\\u(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])|\\\\U(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f])))*>',
      raw: '<([^\\u0000-\\u0020<>\\"{}|^`\\\\]|{UCHAR})*>',
    },
    PN_LOCAL_ESC: {
      in_set: {
        message: `[macro [PN_LOCAL_ESC] is unsuitable for use inside regex set expressions: "[\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%)]"]`,
        name: 'Error',
      },
      elsewhere: "\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%)",
      raw: "\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%)",
    },
    PLX: {
      in_set: {
        message: `[macro [PN_LOCAL_ESC] is unsuitable for use inside regex set expressions: "[\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%)]"]`,
        name: 'Error',
      },
      elsewhere: "(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))",
      raw: '{PERCENT}|{PN_LOCAL_ESC}',
    },
    PN_LOCAL: {
      in_set: {
        message: `[macro [PN_LOCAL_ESC] is unsuitable for use inside regex set expressions: "[\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%)]"]`,
        name: 'Error',
      },
      elsewhere: "((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*",
      raw: '({PN_CHARS_U}|:|[0-9]|{PLX})({PN_CHARS}|\\.|:|{PLX})*',
    },
    PNAME_LN: {
      in_set: {
        message: '[macro [PN_PREFIX] is unsuitable for use inside regex set expressions: "[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-\\udb7f豈-﷏ﷰ-\\ufffd((\\-0-9A·̀-ͯ‿⁀|\\.)*\\-0-9A·̀-ͯ‿⁀)?]"]',
        name: 'Error',
      },
      elsewhere: "(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*)",
      raw: '{PNAME_NS}{PN_LOCAL}',
    },
    ATPNAME_LN: {
      in_set: {
        message: '[macro [PN_PREFIX] is unsuitable for use inside regex set expressions: "[A-Za-zÀ-ÖØ-öø-˿Ͱ-ͽͿ-῿‌‍⁰-↏Ⰰ-⿯、-\\udb7f豈-﷏ﷰ-\\ufffd((\\-0-9A·̀-ͯ‿⁀|\\.)*\\-0-9A·̀-ͯ‿⁀)?]"]',
        name: 'Error',
      },
      elsewhere: "@(?:(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])(((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.)*(?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀]))?)?:)(?:((?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|:|\\d|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))((?:(?:(?:[A-Z]|[a-z]|[À-Ö]|[Ø-ö]|[ø-˿]|[Ͱ-ͽ]|[Ϳ-῿]|[‌‍]|[⁰-↏]|[Ⰰ-⿯]|[、-퟿]|[豈-﷏]|[ﷰ-\\ufffd]|[\\ud800-\\udb7f][\\udc00-\\udfff])|_|_)|-|\\d|[·]|[̀-ͯ]|[‿⁀])|\\.|:|(?:(?:%(?:\\d|[A-F]|[a-f])(?:\\d|[A-F]|[a-f]))|(?:\\\\(_|~|\\.|-|!|\\$|&|'|\\(|\\)|\\*|\\+|,|;|=|\\/|\\?|#|@|%))))*))",
      raw: '@{PNAME_LN}',
    },
    COMMENT: {
      in_set: {
        message: '[macro [COMMENT] is unsuitable for use inside regex set expressions: "[#[^\\u000a\\u000d]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/]"]',
        name: 'Error',
      },
      elsewhere: '#[^\\n\\r]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/',
      raw: '#[^\\u000a\\u000d]*|\\/\\*([^*]|\\*([^/]|\\\\\\/))*\\*\\/',
    },
  },
  regular_rule_count: 4,
  simple_rule_count: 73,
  conditionStack: [
    'INITIAL',
  ],
  actionInclude: `/*
    ShEx parser in the Jison parser generator format.
  */

  const UNBOUNDED = -1;

  //const ShExUtil = require("@shexjs/util");
  // ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  // WARNING: brutal hack to make example compile and run in minimal jison-gho lexer CLI environment.

  // Common namespaces and entities
  const RDF = 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
      RDF_TYPE  = RDF + 'type',
      RDF_FIRST = RDF + 'first',
      RDF_REST  = RDF + 'rest',
      RDF_NIL   = RDF + 'nil',
      XSD = 'http://www.w3.org/2001/XMLSchema#',
      XSD_INTEGER  = XSD + 'integer',
      XSD_DECIMAL  = XSD + 'decimal',
      XSD_FLOAT   = XSD + 'float',
      XSD_DOUBLE   = XSD + 'double',
      XSD_BOOLEAN  = XSD + 'boolean',
      XSD_TRUE =  '"true"^^'  + XSD_BOOLEAN,
      XSD_FALSE = '"false"^^' + XSD_BOOLEAN,
      XSD_PATTERN        = XSD + 'pattern',
      XSD_MININCLUSIVE   = XSD + 'minInclusive',
      XSD_MINEXCLUSIVE   = XSD + 'minExclusive',
      XSD_MAXINCLUSIVE   = XSD + 'maxInclusive',
      XSD_MAXEXCLUSIVE   = XSD + 'maxExclusive',
      XSD_LENGTH         = XSD + 'length',
      XSD_MINLENGTH      = XSD + 'minLength',
      XSD_MAXLENGTH      = XSD + 'maxLength',
      XSD_TOTALDIGITS    = XSD + 'totalDigits',
      XSD_FRACTIONDIGITS = XSD + 'fractionDigits';

  const numericDatatypes = [
      XSD + "integer",
      XSD + "decimal",
      XSD + "float",
      XSD + "double",
      XSD + "string",
      XSD + "boolean",
      XSD + "dateTime",
      XSD + "nonPositiveInteger",
      XSD + "negativeInteger",
      XSD + "long",
      XSD + "int",
      XSD + "short",
      XSD + "byte",
      XSD + "nonNegativeInteger",
      XSD + "unsignedLong",
      XSD + "unsignedInt",
      XSD + "unsignedShort",
      XSD + "unsignedByte",
      XSD + "positiveInteger"
  ];

  const absoluteIRI = /^[a-z][a-z0-9+.-]*:/i,
    schemeAuthority = /^(?:([a-z][a-z0-9+.-]*:))?(?:\\/\\/[^\\/]*)?/i,
    dotSegments = /(?:^|\\/)\\.\\.?(?:$|[\\/#?])/;

  const numericFacets = ["mininclusive", "minexclusive",
                       "maxinclusive", "maxexclusive"];

  // Returns a lowercase version of the given string
  function lowercase(string) {
    return string.toLowerCase();
  }

  // Appends the item to the array and returns the array
  function appendTo(array, item) {
    return array.push(item), array;
  }

  // Appends the items to the array and returns the array
  function appendAllTo(array, items) {
    return array.push.apply(array, items), array;
  }

  // Extends a base object with properties of other objects
  function extend(base) {
    if (!base) base = {};
    for (let i = 1, l = arguments.length, arg; i < l && (arg = arguments[i] || {}); i++)
      for (let name in arg)
        base[name] = arg[name];
    return base;
  }

  // Creates an array that contains all items of the given arrays
  function unionAll() {
    let union = [];
    for (let i = 0, l = arguments.length; i < l; i++)
      union = union.concat.apply(union, arguments[i]);
    return union;
  }

  // N3.js:lib/N3Parser.js<0.4.5>:58 with
  //   s/this\\./Parser./g
  // ### \`_setBase\` sets the base IRI to resolve relative IRIs.
  Parser._setBase = function (baseIRI) {
    if (!baseIRI)
      baseIRI = null;

    // baseIRI '#' check disabled to allow -x 'data:text/shex,...#'
    // else if (baseIRI.indexOf('#') >= 0)
    //   throw new Error('Invalid base IRI ' + baseIRI);

    // Set base IRI and its components
    if (Parser._base = baseIRI) {
      Parser._basePath   = baseIRI.replace(/[^\\/?]*(?:\\?.*)?$/, '');
      baseIRI = baseIRI.match(schemeAuthority);
      Parser._baseRoot   = baseIRI[0];
      Parser._baseScheme = baseIRI[1];
    }
  }

  // N3.js:lib/N3Parser.js<0.4.5>:576 with
  //   s/this\\./Parser./g
  //   s/token/iri/
  // ### \`_resolveIRI\` resolves a relative IRI token against the base path,
  // assuming that a base path has been set and that the IRI is indeed relative.
  function _resolveIRI (iri) {
    switch (iri[0]) {
    // An empty relative IRI indicates the base IRI
    case undefined: return Parser._base;
    // Resolve relative fragment IRIs against the base IRI
    case '#': return Parser._base + iri;
    // Resolve relative query string IRIs by replacing the query string
    case '?': return Parser._base.replace(/(?:\\?.*)?$/, iri);
    // Resolve root-relative IRIs at the root of the base IRI
    case '/':
      // Resolve scheme-relative IRIs to the scheme
      return (iri[1] === '/' ? Parser._baseScheme : Parser._baseRoot) + _removeDotSegments(iri);
    // Resolve all other IRIs at the base IRI's path
    default: {
      return _removeDotSegments(Parser._basePath + iri);
    }
    }
  }

  // ### \`_removeDotSegments\` resolves './' and '../' path segments in an IRI as per RFC3986.
  function _removeDotSegments (iri) {
    // Don't modify the IRI if it does not contain any dot segments
    if (!dotSegments.test(iri))
      return iri;

    // Start with an imaginary slash before the IRI in order to resolve trailing './' and '../'
    const length = iri.length;
    let result = '', i = -1, pathStart = -1, next = '/', segmentStart = 0;

    while (i < length) {
      switch (next) {
      // The path starts with the first slash after the authority
      case ':':
        if (pathStart < 0) {
          // Skip two slashes before the authority
          if (iri[++i] === '/' && iri[++i] === '/')
            // Skip to slash after the authority
            while ((pathStart = i + 1) < length && iri[pathStart] !== '/')
              i = pathStart;
        }
        break;
      // Don't modify a query string or fragment
      case '?':
      case '#':
        i = length;
        break;
      // Handle '/.' or '/..' path segments
      case '/':
        if (iri[i + 1] === '.') {
          next = iri[++i + 1];
          switch (next) {
          // Remove a '/.' segment
          case '/':
            result += iri.substring(segmentStart, i - 1);
            segmentStart = i + 1;
            break;
          // Remove a trailing '/.' segment
          case undefined:
          case '?':
          case '#':
            return result + iri.substring(segmentStart, i) + iri.substr(i + 1);
          // Remove a '/..' segment
          case '.':
            next = iri[++i + 1];
            if (next === undefined || next === '/' || next === '?' || next === '#') {
              result += iri.substring(segmentStart, i - 2);
              // Try to remove the parent path from result
              if ((segmentStart = result.lastIndexOf('/')) >= pathStart)
                result = result.substr(0, segmentStart);
              // Remove a trailing '/..' segment
              if (next !== '/')
                return result + '/' + iri.substr(i + 1);
              segmentStart = i + 1;
            }
          }
        }
      }
      next = iri[++i];
    }
    return result + iri.substring(segmentStart);
  }

  // Creates an expression with the given type and attributes
  function expression(expr, attr) {
    const expression = { expression: expr };
    if (attr)
      for (let a in attr)
        expression[a] = attr[a];
    return expression;
  }

  // Creates a path with the given type and items
  function path(type, items) {
    return { type: 'path', pathType: type, items: items };
  }

  // Creates a literal with the given value and type
  function createLiteral(value, type) {
    return { value: value, type: type };
  }

  // Creates a new blank node identifier
  function blank() {
    return '_:b' + blankId++;
  };
  let blankId = 0;
  Parser._resetBlanks = function () { blankId = 0; }
  Parser.reset = function () {
    Parser._prefixes = Parser._imports = Parser._sourceMap = Parser.shapes = Parser.productions = Parser.start = Parser.startActs = null; // Reset state.
    Parser._base = Parser._baseIRI = Parser._baseIRIPath = Parser._baseIRIRoot = null;
  }
  let _fileName; // for debugging
  Parser._setFileName = function (fn) { _fileName = fn; }

  // Regular expression and replacement strings to escape strings
  const stringEscapeReplacements = { '\\\\': '\\\\', "'": "'", '"': '"',
                                   't': '\\t', 'b': '\\b', 'n': '\\n', 'r': '\\r', 'f': '\\f' },
      semactEscapeReplacements = { '\\\\': '\\\\', '%': '%' },
      pnameEscapeReplacements = {
        '\\\\': '\\\\', "'": "'", '"': '"',
        'n': '\\n', 'r': '\\r', 't': '\\t', 'f': '\\f', 'b': '\\b',
        '_': '_', '~': '~', '.': '.', '-': '-', '!': '!', '$': '$', '&': '&',
        '(': '(', ')': ')', '*': '*', '+': '+', ',': ',', ';': ';', '=': '=',
        '/': '/', '?': '?', '#': '#', '@': '@', '%': '%',
      };


  // Translates string escape codes in the string into their textual equivalent
  function unescapeString(string, trimLength) {
    string = string.substring(trimLength, string.length - trimLength);
    return { value: ShExUtil.unescapeText(string, stringEscapeReplacements) };
  }

  function unescapeLangString(string, trimLength) {
    const at = string.lastIndexOf("@");
    const lang = string.substr(at);
    string = string.substr(0, at);
    const u = unescapeString(string, trimLength);
    return extend(u, { language: lowercase(lang.substr(1)) });
  }

  // Translates regular expression escape codes in the string into their textual equivalent
  function unescapeRegexp (regexp) {
    const end = regexp.lastIndexOf("/");
    let s = regexp.substr(1, end-1);
    const regexpEscapeReplacements = {
      '.': "\\\\.", '\\\\': "\\\\\\\\", '?': "\\\\?", '*': "\\\\*", '+': "\\\\+",
      '{': "\\\\{", '}': "\\\\}", '(': "\\\\(", ')': "\\\\)", '|': "\\\\|",
      '^': "\\\\^", '$': "\\\\$", '[': "\\\\[", ']': "\\\\]", '/': "\\\\/",
      't': '\\\\t', 'n': '\\\\n', 'r': '\\\\r', '-': "\\\\-", '/': '/'
    };
    s = ShExUtil.unescapeText(s, regexpEscapeReplacements)
    const ret = {
      pattern: s
    };
    if (regexp.length > end+1)
      ret.flags = regexp.substr(end+1);
    return ret;
  }

  // Convenience function to return object with p1 key, value p2
  function keyValObject(key, val) {
    const ret = {};
    ret[key] = val;
    return ret;
  }

  // Return object with p1 key, p2 string value
  function unescapeSemanticAction(key, string) {
    string = string.substring(1, string.length - 2);
    return {
      type: "SemAct",
      name: key,
      code: ShExUtil.unescapeText(string, semactEscapeReplacements)
    };
  }

  function error (e, yy) {
    const hash = {
      text: yy.lexer.match,
      // token: this.terminals_[symbol] || symbol,
      line: yy.lexer.yylineno,
      loc: yy.lexer.yylloc,
      // expected: expected
      pos: yy.lexer.showPosition()
    }
    e.hash = hash;
    if (Parser.recoverable) {
      Parser.recoverable(e)
    } else {
      throw e;
      Parser.reset();
    }
  }

  // Expand declared prefix or throw Error
  function expandPrefix (prefix, yy) {
    if (!(prefix in Parser._prefixes))
      error(new Error('Parse error; unknown prefix "' + prefix + ':"'), yy);
    return Parser._prefixes[prefix];
  }

  // Add a shape to the map
  function addShape (label, shape, yy) {
    if (shape === EmptyShape)
      shape = { type: "Shape" };
    if (Parser.productions && label in Parser.productions)
      error(new Error("Structural error: "+label+" is a triple expression"), yy);
    if (!Parser.shapes)
      Parser.shapes = new Map();
    if (label in Parser.shapes) {
      if (Parser.options.duplicateShape === "replace")
        Parser.shapes[label] = shape;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else {
      Parser.shapes[label] = Object.assign({id: label}, shape);
    }
  }

  // Add a production to the map
  function addProduction (label, production, yy) {
    if (Parser.shapes && label in Parser.shapes)
      error(new Error("Structural error: "+label+" is a shape expression"), yy);
    if (!Parser.productions)
      Parser.productions = new Map();
    if (label in Parser.productions) {
      if (Parser.options.duplicateShape === "replace")
        Parser.productions[label] = production;
      else if (Parser.options.duplicateShape !== "ignore")
        error(new Error("Parse error: "+label+" already defined"), yy);
    } else
      Parser.productions[label] = production;
  }

  function addSourceMap (obj, yy) {
    if (!Parser._sourceMap)
      Parser._sourceMap = new Map();
    let list = Parser._sourceMap.get(obj)
    if (!list)
      Parser._sourceMap.set(obj, list = []);
    list.push(yy.lexer.yylloc);
    return obj;
  }

  // shapeJunction judiciously takes a shapeAtom and an optional list of con/disjuncts.
  // No created Shape{And,Or,Not} will have a \`nested\` shapeExpr.
  // Don't nonest arguments to shapeJunction.
  // shapeAtom emits \`nested\` so nonest every argument that can be a shapeAtom, i.e.
  //   shapeAtom, inlineShapeAtom, shapeAtomNoRef
  //   {,inline}shape{And,Or,Not}
  //   this does NOT include shapeOrRef or nodeConstraint.
  function shapeJunction (type, shapeAtom, juncts) {
    if (juncts.length === 0) {
      return nonest(shapeAtom);
    } else if (shapeAtom.type === type && !shapeAtom.nested) {
      nonest(shapeAtom).shapeExprs = nonest(shapeAtom).shapeExprs.concat(juncts);
      return shapeAtom;
    } else {
      return { type: type, shapeExprs: [nonest(shapeAtom)].concat(juncts) };
    }
  }

  // strip out .nested attribute
  function nonest (shapeAtom) {
    delete shapeAtom.nested;
    return shapeAtom;
  }

  const EmptyObject = {  };
  const EmptyShape = { type: "Shape" }`,
  moduleInclude: '',
  __in_rules_failure_analysis_mode__: false,
  is_custom_lexer: false,
}

