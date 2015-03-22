/********************************************************************************
/*
 * triggeredAutocomplete (jQuery UI autocomplete widget)
 * 2012 by Hawkee.com (hawkee@gmail.com)
 * 2015 by Janek Hiis (janek@weekdone.com)
 *
 * Version 1.5
 * 
 * Requires jQuery 1.7 and jQuery UI 1.8
 *
 * Dual licensed under MIT or GPLv2 licenses
 *   http://en.wikipedia.org/wiki/MIT_License
 *   http://en.wikipedia.org/wiki/GNU_General_Public_License
 *
*/

;(function ( $, window, document, undefined ) {
	$.widget("ui.triggeredAutocomplete", $.extend(true, {}, $.ui.autocomplete.prototype, {
		
		options: {
			trigger: "@",
			allowDuplicates: true,
			maxLength: 0
		},

		_create:function() {

			var self = this;
			this.id_map = new Object();
			this.stopIndex = -1;
			this.stopLength = -1;
			this.contents = '';
			this.cursorPos = 0;
			this.last_index = -1;

			// Fixes some events improperly handled by ui.autocomplete
			this.element.bind('keydown.autocomplete.fix', function (e) {
				switch (e.keyCode) {
					case $.ui.keyCode.ESCAPE:
						self.close(e);
						e.stopImmediatePropagation();
						break;
					case $.ui.keyCode.UP:
					case $.ui.keyCode.DOWN:
						if (!self.menu.element.is(":visible")) {
							e.stopImmediatePropagation();
						}
				}
			});

			// Check for the id_map as an attribute.  This is for editing.

			var id_map_string = this.element.attr('id_map');
			if (id_map_string) this.id_map = jQuery.parseJSON(id_map_string);

			this.ac = $.ui.autocomplete.prototype;
			this.ac._create.apply(this, arguments);

			this.updateHidden();

			// Select function defined via options.
			this.options.select = function(event, ui) {
				var contents = self.contents;
				var cursorPos = self.cursorPos;

				// Save everything following the cursor (in case they went back to add a mention)
				// Separate everything before the cursor
				// Remove the trigger and search
				// Rebuild: start + result + end

				var end = contents.substring(cursorPos, contents.length);
				var start = contents.substring(0, self.last_index);
				var trigger = start.slice(-1);

				var top = self.element.scrollTop();
				this.value = start + ui.item.label + ' ' + end;
				self.element.scrollTop(top);

				// Create an id map so we can create a hidden version of this string with id's instead of labels.

				self.id_map[trigger + ui.item.label] = ui.item.value;
				self.updateHidden();

				// Places the caret right after the inserted item.
				var index = start.length + ui.item.label.length + 2;
				if (this.createTextRange) {
					var range = this.createTextRange();
					range.move('character', index);
					range.select();
				} else if (this.setSelectionRange) {
					this.setSelectionRange(index, index);
				}
				
				return false;
			};

			// Don't change the input as you browse the results.
			this.options.focus = function(event, ui) { return false; }
			this.menu.options.blur = function(event, ui) { return false; }

			// Any changes made need to update the hidden field.
			this.element.focus(function() { self.updateHidden(); });
			this.element.change(function() { self.updateHidden(); });
		},

		// If there is an 'img' then show it beside the label.

		_renderItem:  function( ul, item ) {
			if(item.img != undefined) {
				return $( "<li></li>" )
					.data( "item.autocomplete", item )
					.append( "<a>" + "<img src='" + item.img + "' /><span>"+item.label+"</span></a>" )
					.appendTo( ul );
			}		
			else {	
				return $( "<li></li>" )
					.data( "item.autocomplete", item )
					.append( $( "<a></a>" ).text( item.label ) )
					.appendTo( ul );
			}
		},

		// This stops the input box from being cleared when traversing the menu.

		_move: function( direction, event ) {
			if ( !this.menu.element.is(":visible") ) {
				this.search( null, event );
				return;
			}
			if ( this.menu.first() && /^previous/.test(direction) ||
					this.menu.last() && /^next/.test(direction) ) {
				this.menu.deactivate();
				return;
			}
			this.menu[ direction ]( event );
		},

		search: function(value, event) {

			var contents = this.element.val();
			var cursorPos = this.getCursor();
			this.contents = contents;
			this.cursorPos = cursorPos;

			// Check that the trigger is not in the middle of a word
			// This avoids trying to match in the middle of email addresses when '@' is used as the trigger

			var regex = new RegExp("(^|\\s)([" + this.options.trigger + "][\\w-]*)$");
			var result = regex.exec(contents.substring(0, cursorPos));

			if(result && result[2]) {
				// Only query the server if we have a term and we haven't received a null response.
				// First check the current query to see if it already returned a null response.
                                var term = result[2];

				if (this.stopIndex == result.index && term.length > this.stopLength) { term = ''; }

				if (term.length > 0 && (!this.options.maxLength || term.length <= this.options.maxLength)) {
					// Updates the hidden field to check if a name was removed so that we can put them back in the list.
					this.updateHidden();
					this.last_index = result.index + result[1].length + 1;
					return this._search(term);
				}
			}	
			this.close();
		},

		// Slightly altered the default ajax call to stop querying after the search produced no results.
		// This is to prevent unnecessary querying.

		_initSource: function() {
			var self = this, array, url;
			if ( $.isArray(this.options.source) ) {
				array = this.options.source;
				this.source = function( request, response ) {
					response( $.ui.autocomplete.filter(array, request.term) );
				};
			} else if ( typeof this.options.source === "string" ) {
				url = this.options.source;
				this.source = function( request, response ) {
					if ( self.xhr ) {
						self.xhr.abort();
					}
					request.trigger = request.term.substring(0, 1);
					request.term = request.term.substring(1);
					self.xhr = $.ajax({
						url: url,
						data: request,
						dataType: 'json',
						success: function(data) {
							if(data.length) {
								response($.map(data, function(item) {
									if (typeof item === "string") {
										label = item;
									}
									else {
										label = item.label;
									}
									// If the item has already been selected don't re-include it.
									if(!self.id_map[label] || self.options.allowDuplicates) {
										return item
									}
								}));
								self.stopLength = -1;
								self.stopIndex = -1;
							}
							else {
								// No results, record length of string and stop querying unless the length decreases
								self.stopLength = request.term.length;
								self.stopIndex = self.contents.lastIndexOf(request.term);
								self.close();
							}
						}
					});
				};
			} else {
				this.source = this.options.source;
			}
		},

		destroy: function() {
			$.Widget.prototype.destroy.call(this);
		},

		// Gets the position of the cursor in the input box.

		getCursor: function() {
			var i = this.element[0];

			if(i.selectionStart) {
				return i.selectionStart;
			}
			else if(i.ownerDocument.selection) {
				var range = i.ownerDocument.selection.createRange();
				if(!range) return 0;
				var textrange = i.createTextRange();
				var textrange2 = textrange.duplicate();

				textrange.moveToBookmark(range.getBookmark());
				textrange2.setEndPoint('EndToStart', textrange);
				return textrange2.text.length;
			}
		},

		// Populates the hidden field with the contents of the entry box but with 
		// ID's instead of usernames.  Better for storage.

		updateHidden: function() {
			var contents = this.element.val();
			var top = this.element.scrollTop();

			for(var key in this.id_map) {
				var old_contents = contents;
				var find = key;
				var trigger = key.substring(0,1);

				find = find.replace(/[^a-zA-Z 0-9@]+/g,'\\$&');
				var regex = new RegExp(find, "g");

				contents = contents.replace(regex, trigger+'['+this.id_map[key]+']');
				if (old_contents == contents) delete this.id_map[key];
			}
			if (this.options.hidden != undefined)
				$(this.options.hidden).val(contents);
			this.element.scrollTop(top);
		}

	}));	
})( jQuery, window , document );
