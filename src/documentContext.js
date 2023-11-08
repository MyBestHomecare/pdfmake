'use strict';

var TraversalTracker = require('./traversalTracker');
var isString = require('./helpers').isString;

/**
 * Creates an instance of DocumentContext - a store for current x, y positions and available width/height.
 * It facilitates column divisions and vertical sync
 */
function DocumentContext(pageSize, pageMargins) {
	this.pages = [];

	this.pageMargins = pageMargins;

	this.x = pageMargins.left;
	this.availableWidth = pageSize.width - pageMargins.left - pageMargins.right;
	this.availableHeight = 0;
	this.page = -1;

	this.snapshots = [];

	this.endingCell = null;

	this.tracker = new TraversalTracker();

	this.backgroundLength = [];

	this.addPage(pageSize);
}

DocumentContext.prototype.beginColumnGroup = function () {
	this.snapshots.push({
		x: this.x,
		y: this.y,
		availableHeight: this.availableHeight,
		availableWidth: this.availableWidth,
		page: this.page,
		bottomMost: {
			x: this.x,
			y: this.y,
			availableHeight: this.availableHeight,
			availableWidth: this.availableWidth,
			page: this.page
		},
		endingCell: this.endingCell,
		lastColumnWidth: this.lastColumnWidth
	});

	this.lastColumnWidth = 0;
};

DocumentContext.prototype.beginColumn = function (width, offset, endingCell) {
	var saved = this.snapshots[this.snapshots.length - 1];

	this.calculateBottomMost(saved);

	this.endingCell = endingCell;
	this.page = saved.page;
	this.x = this.x + this.lastColumnWidth + (offset || 0);
	this.y = saved.y;
	this.availableWidth = width;	//saved.availableWidth - offset;
	this.availableHeight = saved.availableHeight;

	this.lastColumnWidth = width;
};

DocumentContext.prototype.calculateBottomMost = function (destContext) {
	if (this.endingCell) {
		this.saveContextInEndingCell(this.endingCell);
		this.endingCell = null;
	} else {
		destContext.bottomMost = bottomMostContext(this, destContext.bottomMost);
	}
};

DocumentContext.prototype.markEnding = function (endingCell) {
	this.page = endingCell._columnEndingContext.page;
	this.x = endingCell._columnEndingContext.x;
	this.y = endingCell._columnEndingContext.y;
	this.availableWidth = endingCell._columnEndingContext.availableWidth;
	this.availableHeight = endingCell._columnEndingContext.availableHeight;
	this.lastColumnWidth = endingCell._columnEndingContext.lastColumnWidth;
};

DocumentContext.prototype.saveContextInEndingCell = function (endingCell) {
	endingCell._columnEndingContext = {
		page: this.page,
		x: this.x,
		y: this.y,
		availableHeight: this.availableHeight,
		availableWidth: this.availableWidth,
		lastColumnWidth: this.lastColumnWidth
	};
};

DocumentContext.prototype.completeColumnGroup = function (height) {
	var saved = this.snapshots.pop();
	if (saved.overflowed) this.snapshots.pop();

	this.calculateBottomMost(saved);

	this.endingCell = null;
	this.x = saved.x;

	var y = saved.bottomMost.y;
	if (height) {
		if (saved.page === saved.bottomMost.page) {
			if ((saved.y + height) > y) {
				y = saved.y + height;
			}
		} else {
			y += height;
		}
	}

	this.y = y;
	this.page = saved.bottomMost.page;
	this.availableWidth = saved.availableWidth;
	this.availableHeight = saved.bottomMost.availableHeight;
	if (height) {
		this.availableHeight -= (y - saved.bottomMost.y);
	}
	this.lastColumnWidth = saved.lastColumnWidth;
};

DocumentContext.prototype.addMargin = function (left, right) {
	this.x += left;
	this.availableWidth -= left + (right || 0);
};

DocumentContext.prototype.moveDown = function (offset) {
	this.y += offset;
	this.availableHeight -= offset;

	return this.availableHeight > 0;
};

DocumentContext.prototype.initializePage = function () {
	this.y = this.pageMargins.top;
	this.availableHeight = this.getCurrentPage().pageSize.height - this.pageMargins.top - this.pageMargins.bottom;
	this.pageSnapshot().availableWidth = this.getCurrentPage().pageSize.width - this.pageMargins.left - this.pageMargins.right;
};

DocumentContext.prototype.pageSnapshot = function () {
	if (this.snapshots[0]) {
		return this.snapshots[0];
	} else {
		return this;
	}
};

DocumentContext.prototype.moveTo = function (x, y) {
	if (x !== undefined && x !== null) {
		this.x = x;
		this.availableWidth = this.getCurrentPage().pageSize.width - this.x - this.pageMargins.right;
	}
	if (y !== undefined && y !== null) {
		this.y = y;
		this.availableHeight = this.getCurrentPage().pageSize.height - this.y - this.pageMargins.bottom;
	}
};

DocumentContext.prototype.moveToRelative = function (x, y) {
	if (x !== undefined && x !== null) {
		this.x = this.x + x;
	}
	if (y !== undefined && y !== null) {
		this.y = this.y + y;
	}
};

DocumentContext.prototype.beginDetachedBlock = function () {
	this.snapshots.push({
		x: this.x,
		y: this.y,
		availableHeight: this.availableHeight,
		availableWidth: this.availableWidth,
		page: this.page,
		endingCell: this.endingCell,
		lastColumnWidth: this.lastColumnWidth
	});
};

DocumentContext.prototype.endDetachedBlock = function () {
	var saved = this.snapshots.pop();

	this.x = saved.x;
	this.y = saved.y;
	this.availableWidth = saved.availableWidth;
	this.availableHeight = saved.availableHeight;
	this.page = saved.page;
	this.endingCell = saved.endingCell;
	this.lastColumnWidth = saved.lastColumnWidth;
};

function pageOrientation(pageOrientationString, currentPageOrientation) {
	if (pageOrientationString === undefined) {
		return currentPageOrientation;
	} else if (isString(pageOrientationString) && (pageOrientationString.toLowerCase() === 'landscape')) {
		return 'landscape';
	} else {
		return 'portrait';
	}
}

var getPageSize = function (currentPage, newPageOrientation) {

	newPageOrientation = pageOrientation(newPageOrientation, currentPage.pageSize.orientation);

	if (newPageOrientation !== currentPage.pageSize.orientation) {
		return {
			orientation: newPageOrientation,
			width: currentPage.pageSize.height,
			height: currentPage.pageSize.width
		};
	} else {
		return {
			orientation: currentPage.pageSize.orientation,
			width: currentPage.pageSize.width,
			height: currentPage.pageSize.height
		};
	}

};

// FIXME: Complete the function
// Write a moveToNextColumn method that will move to the next column in the current page, or the first column of the next page if the current page is full
DocumentContext.prototype.moveToNextColumn = function () {
	var prevY = this.y;
	this.beginColumn(this.availableWidth, 0, this.endingCell)

	// var newSnapshots = this.snapshots.flatMap((originalSnapshot, i, allSnapshots) => {
	// 	//if (i === 0) return [originalSnapshot];

	// 	var newSnapshot = Object.assign({}, originalSnapshot);
	// 	newSnapshot.overflowed = true; // IMPORTANT

	// 	// FIXME: Calculate "x" and "availableWidth" properly
	// 	//newSnapshot.x += this.availableWidth - this.pageMargins.left; // for basic text
	// 	newSnapshot.x += originalSnapshot.availableWidth; // for tables
	// 	newSnapshot.y = allSnapshots[0].y; // 40 or 43 ???
	// 	newSnapshot.page = originalSnapshot.page;
	// 	newSnapshot.availableHeight = allSnapshots[0].availableHeight; // -6
	// 	newSnapshot.availableWidth = this.availableWidth;

	// 	newSnapshot.bottomMost = {
	// 		x: newSnapshot.x,
	// 		y: newSnapshot.y,
	// 		page: newSnapshot.page,
	// 		availableHeight: newSnapshot.availableHeight,
	// 		availableWidth5: newSnapshot.availableWidth,
	// 	};
	// 	newSnapshot.endingCell = originalSnapshot.endingCell;
	// 	newSnapshot.lastColumnWidth = originalSnapshot.lastColumnWidth; // Flexible width?

	// 	return [originalSnapshot, newSnapshot];
	// });
	
	// this.snapshots = newSnapshots;

	// // FIXME: Replace hardcoded values with proper variables
	// var yOffset = 0; // 0 for text, 3 for tables, -5 for tables with repeatble headers
	// var colLeftOffset = 0; // default = 0 for tables, 5 in LayoutBuilder

	// this.x += this.snapshots.at(-1).x + colLeftOffset;
	// this.y = this.snapshots.at(-1).y + yOffset;
	// //this.page = this.snapshots.at(-1).page;
	// this.availableHeight = this.snapshots.at(-1).availableHeight - (yOffset * 2);
	// this.availableWidth = this.snapshots.at(-1).availableWidth;
	// //this.lastColumnWidth = this.snapshots.at(-1).lastColumnWidth;
	// //this.endingCell = this.snapshots.at(-1).endingCell;
	
	return {
		containerX: this.snapshots.at(-1).x,
		containerY: this.snapshots.at(-1).y,
		contentX: this.x,
		contentY: this.y,
		prevY: prevY,
	};
};

DocumentContext.prototype.moveToNextPage = function (pageOrientation) {
	var nextPageIndex = this.page + 1;

	var prevPage = this.page;
	var prevY = this.y;

	var createNewPage = nextPageIndex >= this.pages.length;
	if (createNewPage) {
		var currentAvailableWidth = this.availableWidth;
		var currentPageOrientation = this.getCurrentPage().pageSize.orientation;

		var pageSize = getPageSize(this.getCurrentPage(), pageOrientation);
		this.addPage(pageSize);

		if (currentPageOrientation === pageSize.orientation) {
			this.availableWidth = currentAvailableWidth;
		}
	} else {
		this.page = nextPageIndex;
		this.initializePage();
	}

	return {
		newPageCreated: createNewPage,
		prevPage: prevPage,
		prevY: prevY,
		y: this.y
	};
};


DocumentContext.prototype.addPage = function (pageSize) {
	var page = { items: [], pageSize: pageSize };
	this.pages.push(page);
	this.backgroundLength.push(0);
	this.page = this.pages.length - 1;
	this.initializePage();

	this.tracker.emit('pageAdded');

	return page;
};

DocumentContext.prototype.getCurrentPage = function () {
	if (this.page < 0 || this.page >= this.pages.length) {
		return null;
	}

	return this.pages[this.page];
};

DocumentContext.prototype.getCurrentPosition = function () {
	var pageSize = this.getCurrentPage().pageSize;
	var innerHeight = pageSize.height - this.pageMargins.top - this.pageMargins.bottom;
	var innerWidth = pageSize.width - this.pageMargins.left - this.pageMargins.right;

	return {
		pageNumber: this.page + 1,
		pageOrientation: pageSize.orientation,
		pageInnerHeight: innerHeight,
		pageInnerWidth: innerWidth,
		left: this.x,
		top: this.y,
		verticalRatio: ((this.y - this.pageMargins.top) / innerHeight),
		horizontalRatio: ((this.x - this.pageMargins.left) / innerWidth)
	};
};

function bottomMostContext(c1, c2) {
	var r;

	if (c1.page > c2.page) {
		r = c1;
	} else if (c2.page > c1.page) {
		r = c2;
	} else {
		r = (c1.y > c2.y) ? c1 : c2;
	}

	return {
		page: r.page,
		x: r.x,
		y: r.y,
		availableHeight: r.availableHeight,
		availableWidth: r.availableWidth
	};
}

module.exports = DocumentContext;
