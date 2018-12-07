
//
// Notes about layers:
// - unlike the render() method of the map and the layer, the renderer() property should assume that the
//   viewport transformation has already been applied to the context.
// - calls to teh render() method of layers are surrounded by context.save() / context.restore() to limit
//   the effect of state changes. That method must return with the state stack at the same size as when
//   it is called.
//
AwesomeMap = {

	//
	// The viewport. Handles display transformation, panning, and zooming.
	//
	Viewport: (function() {

		function constructor() {

			// the factor by which displayed map features are larger than real map features
			this.zoom = 1;

			// the position of the map's origin on the page measured in pixels
			this.mapOriginX = 0;
			this.mapOriginY = 0;

			// used by the map internally
			this.drawCallback = function() {};

		}

		constructor.prototype = {

			applyToContext: function(context) {
				context.translate(this.mapOriginX, this.mapOriginY);
				context.scale(this.zoom, this.zoom);
			},

			applyToContextReverse: function(context) {
				context.scale(1.0 / this.zoom, 1.0 / this.zoom);
				context.translate(-this.mapOriginX, -this.mapOriginY);
			},

			applyDeltaToContext: function(context, baseTransform) {
				this.applyToContext(context);
				baseTransform.applyToContextReverse(context);
			},

			transformPoint: function(point) {
				return {
					x: this.zoom * point.x + this.mapOriginX,
					y: this.zoom * point.y + this.mapOriginY,
				};
			},

			transformVector: function(vector) {
				return {
					x: this.zoom * vector.x,
					y: this.zoom * vector.y,
				};
			},

			transformDistance: function(distance) {
				return this.zoom * distance;
			},

			untransformMouseEvent: function(event) {
				return this.untransformPoint(getRelativePositionForMouseEvent(event));
			},

			untransformPoint: function(point) {
				return {
					x: (point.x - this.mapOriginX) / this.zoom,
					y: (point.y - this.mapOriginY) / this.zoom,
				};
			},

			untransformVector: function(vector) {
				return {
					x: vector.x / this.zoom,
					y: vector.y / this.zoom,
				};
			},

			untransformDistance: function(distance) {
				return distance / this.zoom;
			},

			zoomAtPixelPosition: function(pixelX, pixelY, factor) {
				this.zoom *= factor;
				this.mapOriginX += (pixelX - this.mapOriginX) * (1 - factor);
				this.mapOriginY += (pixelY - this.mapOriginY) * (1 - factor);
				this.drawCallback();
				this.onChange();
			},

			panByPixelAmount: function(pixelDeltaX, pixelDeltaY) {
				this.mapOriginX += pixelDeltaX;
				this.mapOriginY += pixelDeltaY;
				this.drawCallback();
				this.onChange();
			},

            // see map.focusMapCoordinates() for a more convenient variant that focuses at the center of the canvas
			focusMapCoordinates: function(x, y, targetPixelX, targetPixelY) {
                this.mapOriginX = targetPixelX - this.zoom * x;
                this.mapOriginY = targetPixelY - this.zoom * y;
			},

			cloneForTransformation: function() {
				var clone = new AwesomeMap.Viewport();
				clone.zoom = this.zoom;
				clone.mapOriginX = this.mapOriginX;
				clone.mapOriginY = this.mapOriginY;
				return clone;
			},

			onChange: function() {
			},

		};

		return constructor;
	})(),

	//
	// the enclosing map object itself
	//
	Map: (function() {

		function constructor(canvas) {
			this.canvas = canvas;
			this.viewport = new AwesomeMap.Viewport();
			this.viewport.drawCallback = this.render.bind(this);
			this.layers = [];
			this._renderScheduled = false;
			this._resizeScheduled = false;
			this.clickCallback = null;
			var self = this;

			var $canvas = $(canvas);
            $canvas.on('mousewheel', function(event) {
                var point = getRelativePositionForMouseEvent(event);
                var factor = Math.exp(event.deltaY * event.deltaFactor / 1000);
                self.viewport.zoomAtPixelPosition(point.x, point.y, factor);
                return false;
            });
            $canvas.awesomeDrag(function(dx, dy) {
                self.viewport.panByPixelAmount(dx, dy);
            }, function(originalEvent) {
                if (self.clickCallback) {
                    return self.clickCallback(originalEvent);
                } else {
                    return false;
                }
            });
		}

		constructor.prototype = {

            //
            // Called before actually rendering the map
            //
            onBeforeRender: function(context) {
            },

			//
			// Renders the map.
			//
			// This method is rate-limited so it can be called very often without actually redrawing every time.
			//
			render: function() {

				function renderNow() {
					var context = this.canvas.getContext('2d');
					this.onBeforeRender(context);
					context.setTransform(1, 0, 0, 1, 0, 0);
					this.viewport.applyToContext(context);
					for (var i in this.layers) {
						context.save();
						this.layers[i].render(context, this.viewport);
						context.restore();
					}
					this._renderScheduled = false;
				}

				if (!this._renderScheduled) {
					setTimeout(renderNow.bind(this), 10);
					this._renderScheduled = true;
				}

			},

			//
			// Install a resizer function. This function should determine the new desired size of the canvas and
			// apply that size to the canvas (which gets passed as an argument to the resizer function). The resizer
			// is rate-limited using the specified timeout (in milliseconds). Installing the resizer will call it
			// once initially to configure the initial size.
			//
			installResizer: function(resizer, timeout) {
				var self = this;

                function handleResize() {
                	resizer(self.canvas);
					self.render();
                    self._resizeScheduled = false;
                }

                $(window).resize(function() {
                	if (!self._resizeScheduled) {
                    	setTimeout(handleResize.bind(self), timeout);
                		self._resizeScheduled = true;
                	}
                });

				self._resizeScheduled = true;
                handleResize.bind(self)();

			},

			focusMapCoordinates: function(x, y) {
			    this.viewport.focusMapCoordinates(x, y, this.canvas.width / 2, this.canvas.height / 2);
			},

		};

		return constructor;
	})(),

};
