'use strict';

var isUndefined = require('./helpers').isUndefined;
var ElementWriter = require('./elementWriter');

/**
 * Creates an instance of PageElementWriter - an extended ElementWriter
 * which can handle:
 * - page-breaks (it adds new pages when there's not enough space left),
 * - repeatable fragments (like table-headers, which are repeated everytime
 *                         a page-break occurs)
 * - transactions (used for unbreakable-blocks when we want to make sure
 *                 whole block will be rendered on the same page)
 */
function PageElementWriter(context, tracker) {
	this.transactionLevel = 0;
	this.repeatables = [];
	this.tracker = tracker;
	this.writer = new ElementWriter(context, tracker);
}

function fitOnPage(self, addFct) {
	var position = addFct(self);
	const sneakyColumn = true;
	if (!position) {
		if (sneakyColumn) {
			const nextColumn = self.moveToNextColumn();
			if (nextColumn === false) {
				const context = self.writer.context;
				const columnWidth = context.availableWidth;
				const endingCell = context.endingCell;
				// TODO: offset have to calculate from page snapshot, if offset set in 
				// document definition column then in new column don't be applied.
				const offset = undefined;
				
				context.completeColumnGroup();
				self.moveToNextPage();
				position = addFct(self);	
				context.beginColumnGroup();
				context.beginColumn(columnWidth, offset ,endingCell);				
			} else {
				position = addFct(self);
			}
		} else {
			self.moveToNextPage();
			position = addFct(self);
		}
	}

	// if (!position) {
	// 	// TODO: Swap the hardcoded boolean check below with an option flag inside columns
	// 	// eslint-disable-next-line no-constant-condition
	// 	if (false) {
	// 		if (!self.writer.context.snapshots.at(-1).overflowed) {

	// 			// BUG: Only works with table columns
	// 			self.moveToNextColumn();

	// 			position = addFct(self);
	// 		} else {
	// 			position = addFct(self);
	// 		}
	// 	}


	// 	if (!position) {
	// 		// while (self.writer.context.snapshots.at(-1).overflowed) {
	// 		// 	var popped = self.writer.context.snapshots.pop();

	// 		// 	var snap = self.writer.context.snapshots.at(-1);
	// 		// 	self.writer.context.x = snap.x;
	// 		// 	self.writer.context.y = snap.y;
	// 		// 	self.writer.context.availableHeight = snap.availableHeight;
	// 		// 	self.writer.context.availableWidth = popped.availableWidth;
	// 		// 	self.writer.context.lastColumnWidth = snap.lastColumnWidth;
	// 		// 	self.writer.context.endingCell = snap.endingCell;
	// 		// 	//self.writer.context.page = snap.page;
	// 		// }
	// 		self.moveToNextPage();
	// 		position = addFct(self);
	// 	}
	// }
	return position;
}

PageElementWriter.prototype.addLine = function (line, dontUpdateContextPosition, index) {
	return fitOnPage(this, function (self) {
		return self.writer.addLine(line, dontUpdateContextPosition, index);
	});
};

PageElementWriter.prototype.addImage = function (image, index) {
	return fitOnPage(this, function (self) {
		return self.writer.addImage(image, index);
	});
};

PageElementWriter.prototype.addSVG = function (image, index) {
	return fitOnPage(this, function (self) {
		return self.writer.addSVG(image, index);
	});
};

PageElementWriter.prototype.addQr = function (qr, index) {
	return fitOnPage(this, function (self) {
		return self.writer.addQr(qr, index);
	});
};

PageElementWriter.prototype.addVector = function (vector, ignoreContextX, ignoreContextY, index) {
	return this.writer.addVector(vector, ignoreContextX, ignoreContextY, index);
};

PageElementWriter.prototype.beginClip = function (width, height) {
	return this.writer.beginClip(width, height);
};

PageElementWriter.prototype.endClip = function () {
	return this.writer.endClip();
};

PageElementWriter.prototype.alignCanvas = function (node) {
	this.writer.alignCanvas(node);
};

PageElementWriter.prototype.addFragment = function (fragment, useBlockXOffset, useBlockYOffset, dontUpdateContextPosition) {
	if (!this.writer.addFragment(fragment, useBlockXOffset, useBlockYOffset, dontUpdateContextPosition)) {
		this.moveToNextPage();
		this.writer.addFragment(fragment, useBlockXOffset, useBlockYOffset, dontUpdateContextPosition);
	}
};

PageElementWriter.prototype.moveToNextColumn = function () {

	var nextColumn = this.writer.context.moveToNextColumn();
	if (nextColumn == false) return nextColumn;
	
	// this.repeatables.forEach(function (rep) {
	// 	rep.xOffset = nextColumn.containerX;
	// 	rep.yOffset = nextColumn.containerY;
	// 	// FIXME: This number is currently set based on limited trial and error. Try to set it dynamically.
	// 	rep.height -= 1;
	// 	if (isUndefined(rep.insertedOnPages[this.writer.context.page])) {
	// 		// FIXME: Make sure the line below can be removed safely without affecting the functionality of repeatables such as table header rows.
	// 		//rep.insertedOnPages[this.writer.context.page] = true;
	// 		this.writer.addFragment(rep, true, true);
	// 	} else {
	// 		this.writer.context.moveDown(rep.height);
	// 	}
	// }, this);

	this.writer.tracker.emit('columnChanged', {
		containerX: nextColumn.containerX,
		containerY: nextColumn.containerY,
		contentX: nextColumn.contentX,
		contentY: nextColumn.contentY,
		prevY: nextColumn.prevY,
		prevX: nextColumn.prevX,
	});
};

PageElementWriter.prototype.moveToNextPage = function (pageOrientation) {

	var nextPage = this.writer.context.moveToNextPage(pageOrientation);

	// moveToNextPage is called multiple times for table, because is called for each column
	// and repeatables are inserted only in the first time. If columns are used, is needed
	// call for table in first column and then for table in the second column (is other repeatables).
	this.repeatables.forEach(function (rep) {
		if (isUndefined(rep.insertedOnPages[this.writer.context.page])) {
			rep.insertedOnPages[this.writer.context.page] = true;
			this.writer.addFragment(rep, true);
		} else {
			this.writer.context.moveDown(rep.height);
		}
	}, this);

	this.writer.tracker.emit('pageChanged', {
		prevPage: nextPage.prevPage,
		prevY: nextPage.prevY,
		y: this.writer.context.y
	});
};

PageElementWriter.prototype.beginUnbreakableBlock = function (width, height) {
	if (this.transactionLevel++ === 0) {
		this.originalX = this.writer.context.x;
		this.writer.pushContext(width, height);
	}
};

PageElementWriter.prototype.commitUnbreakableBlock = function (forcedX, forcedY) {
	if (--this.transactionLevel === 0) {
		var unbreakableContext = this.writer.context;
		this.writer.popContext();

		var nbPages = unbreakableContext.pages.length;
		if (nbPages > 0) {
			// no support for multi-page unbreakableBlocks
			var fragment = unbreakableContext.pages[0];
			fragment.xOffset = forcedX;
			fragment.yOffset = forcedY;

			//TODO: vectors can influence height in some situations
			if (nbPages > 1) {
				// on out-of-context blocs (headers, footers, background) height should be the whole DocumentContext height
				if (forcedX !== undefined || forcedY !== undefined) {
					fragment.height = unbreakableContext.getCurrentPage().pageSize.height - unbreakableContext.pageMargins.top - unbreakableContext.pageMargins.bottom;
				} else {
					fragment.height = this.writer.context.getCurrentPage().pageSize.height - this.writer.context.pageMargins.top - this.writer.context.pageMargins.bottom;
					for (var i = 0, l = this.repeatables.length; i < l; i++) {
						fragment.height -= this.repeatables[i].height;
					}
				}
			} else {
				fragment.height = unbreakableContext.y;
			}

			if (forcedX !== undefined || forcedY !== undefined) {
				this.writer.addFragment(fragment, true, true, true);
			} else {
				this.addFragment(fragment);
			}
		}
	}
};

PageElementWriter.prototype.currentBlockToRepeatable = function () {
	var unbreakableContext = this.writer.context;
	var rep = { items: [] };

	unbreakableContext.pages[0].items.forEach(function (item) {
		rep.items.push(item);
	});

	rep.xOffset = this.originalX;

	//TODO: vectors can influence height in some situations
	rep.height = unbreakableContext.y;

	rep.insertedOnPages = [];

	return rep;
};

PageElementWriter.prototype.pushToRepeatables = function (rep) {
	this.repeatables.push(rep);
};

PageElementWriter.prototype.popFromRepeatables = function () {
	this.repeatables.pop();
};

PageElementWriter.prototype.context = function () {
	return this.writer.context;
};

module.exports = PageElementWriter;
