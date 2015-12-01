(function(window, document, L, undefined) {

    function defaults(userSettings) {
        var defaults = Glify.defaults,
            settings = {},
            i;

        for (i in defaults) if (defaults.hasOwnProperty(i)) {
            settings[i] = (userSettings.hasOwnProperty(i) ? userSettings[i] : defaults[i]);
        }

        return settings;
    }

    /**
     *
     * @param settings
     * @constructor
     */
    function Glify(settings) {
        this.settings = defaults(settings);

        if (!settings.vertexShader) throw new Error('no "vertexShader" string setting defined');
        if (!settings.fragmentShader) throw new Error('no "fragmentShader" string setting defined');
        if (!settings.data) throw new Error('no "data" array setting defined');
        if (!settings.map) throw new Error('no leaflet "map" object setting defined');

        var glLayer = this.glLayer = L.canvasOverlay()
                .drawing(function(params) {
                    this.drawOnCanvas(params);
                }.bind(this))
                .addTo(settings.map),
            canvas = this.canvas = glLayer.canvas();

        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        this.gl = canvas.getContext('webgl',{ antialias: true }) || canvas.getContext('experimental-webgl',{ antialias: true });

        this.pixelsToWebGLMatrix = new Float32Array(16);
        this.mapMatrix = new Float32Array(16);
        this.vertexShader = null;
        this.fragmentShader = null;
        this.program = null;
        this.uMatrix = null;
        this.verts = null;
        this.latLngLookup = null;

        this
            .setup()
            .render();
    }

    Glify.defaults = {
        map: null,
        data: [],
        debug: false,
        vertexShader: '',
        fragmentShader: '',
        pointThreshold: 10,
        clickPoint: null,
        color: ''
    };
     Glify.color = {

        green : {r: 0, g: 1, b: 0},
        red   : {r: 1, g: 0, b: 0},
        blue  : {r: 0, g: 0, b: 1},
        teal  : {r: 0, g: 1, b: 1},
        yellow: {r: 1, g: 1, b: 0},

        random: function() {
            return {
                r: Math.random(),
                g: Math.random(),
                b: Math.random()
            };
        },

        pallet : function() {
            switch (Math.round(Math.random() * 4)) {
                case 0: return Glify.color.green;
                case 1: return Glify.color.red;
                case 2: return Glify.color.blue;
                case 3: return Glify.color.teal;
                case 4: return Glify.color.yellow;
                case 5: return Glify.color.random;
                case 6: return Glify.color.random;
            }
        }
    };

    Glify.prototype = {
        /**
         *
         * @returns {Glify}
         */
        setup: function () {
            var self = this,
                settings = this.settings;

            if (settings.clickPoint) {
                settings.map.on('click', function(e) {
                    var point = self.lookup(e.latlng);
                    if (point !== null) {
                        settings.clickPoint(point, e);
                    }


                    if (settings.debug) {
                        self.debugPoint(e.containerPoint);
                    }
                });
            }

            return this
                .setupVertexShader()
                .setupFragmentShader()
                .setupProgram();
        },

        /**
         *
         * @returns {Glify}
         */
        render: function() {
            //empty verts and repopulate
            this.verts = [];
            this.latLngLookup = {};
            // -- data
            var settings = this.settings,
                colorKey = settings.color,
                colorFn,
                color = Glify.color[ colorKey ];

            if (color === undefined) {
                color = colorKey;
            }

            if (color.call !== undefined) {
                colorKey = color;
            }

            //see if colorKey is actually a function
            if (colorKey.call !== undefined) {
                colorFn = colorKey;

                this.settings.data.map(function (latLng, i) {
                    var pixel = this.latLngToPixelXY(latLng[1], latLng[0], latLng[2],latLng[3],latLng[4],latLng[5],latLng[6],latLng[7],latLng[8],latLng[9],latLng[10],latLng[11],latLng[12],latLng[13],latLng[14],latLng[15],latLng[16],latLng[17],latLng[18],latLng[19],latLng[20]),
                        color = colorFn(10);

                    //-- 2 coord, 3 rgb colors interleaved buffer
                    this.verts.push(pixel.x, pixel.y, color.r, color.g, color.b);
                }.bind(this));
            } else {
                this.settings.data.map(function (latLng, i) {
                  var a = [];
                  for (var i = 2; i < latLng.length; i++) {
                    a[i-2] = latLng[i];
                  }
                    var pixel = this.latLngToPixelXY(latLng[1], latLng[0], a);
                    //-- 2 coord, 3 rgb colors interleaved buffer
                    this.verts.push(pixel.x, pixel.y, color.r, color.g, color.b);
                }.bind(this));
            }



            //look up the locations for the inputs to our shaders.
            var gl = this.gl,
                canvas = this.canvas,
                program = this.program,
                glLayer = this.glLayer,
                uMatrix = this.uMatrix = gl.getUniformLocation(program, "uMatrix"),
                colorLocation = gl.getAttribLocation(program, "aColor"),
                vertexLocation = gl.getAttribLocation(program, "aVertex"),
                vertexBuffer = gl.createBuffer(),
                vertexArray = new Float32Array(this.verts),
                fsize = vertexArray.BYTES_PER_ELEMENT;

            gl.aPointSize = gl.getAttribLocation(program, "aPointSize");

            //set the matrix to some that makes 1 unit 1 pixel.
            this.pixelsToWebGLMatrix.set([2 / canvas.width, 0, 0, 0, 0, -2 / canvas.height, 0, 0, 0, 0, 0, 0, -1, 1, 0, 1]);

            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.uniformMatrix4fv(uMatrix, false, this.pixelsToWebGLMatrix);
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, vertexArray, gl.STATIC_DRAW);
            gl.vertexAttribPointer(vertexLocation, 2, gl.FLOAT, false, fsize *5  ,0);
            gl.enableVertexAttribArray(vertexLocation);

            //offset for color buffer
            gl.vertexAttribPointer(colorLocation, 3, gl.FLOAT, false, fsize * 5, fsize * 2);
            gl.enableVertexAttribArray(colorLocation);

            glLayer.redraw();

            return this;
        },

        /**
         *
         * @param data
         * @returns {Glify}
         */
        setData: function(data) {
            this.settings.data = data;
            return this;
        },

        /**
         *
         * @returns {Glify}
         */
        setupVertexShader: function() {
            var gl = this.gl,
                vertexShader = gl.createShader(gl.VERTEX_SHADER);

            gl.shaderSource(vertexShader, this.settings.vertexShader);
            gl.compileShader(vertexShader);

            this.vertexShader = vertexShader;

            return this;
        },

        /**
         *
         * @returns {Glify}
         */
        setupFragmentShader: function() {
            var gl = this.gl,
                fragmentShader = gl.createShader(gl.FRAGMENT_SHADER);

            gl.shaderSource(fragmentShader, this.settings.fragmentShader);
            gl.compileShader(fragmentShader);

            this.fragmentShader = fragmentShader;

            return this;
        },

        /**
         *
         * @returns {Glify}
         */
        setupProgram: function() {
            // link shaders to create our program
            var gl = this.gl,
                program = gl.createProgram();

            gl.attachShader(program, this.vertexShader);
            gl.attachShader(program, this.fragmentShader);
            gl.linkProgram(program);
            gl.useProgram(program);
            //gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
            //gl.BlendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
            gl.enable(gl.BLEND);

            this.program = program;

            return this;
        },

        /**
         *
         * @param params
         * @returns {Glify}
         */
        drawOnCanvas: function(params) {
            if (this.gl == null) return this;

            var gl = this.gl,
                canvas = this.canvas,
                map = this.settings.map,
                zoom = map.getZoom(),
                bounds = map.getBounds(),
                topLeft = new L.LatLng(bounds.getNorth(), bounds.getWest()),
                offset = this.latLngToPixelXY(topLeft.lat, topLeft.lng),
                // -- Scale to current zoom
                scale = Math.pow(2, zoom),
                pointSize = Math.max(zoom - 4.0, 2.0);

            gl.clear(gl.COLOR_BUFFER_BIT);

            this.pixelsToWebGLMatrix.set([2 / canvas.width, 0, 0, 0, 0, -2 / canvas.height, 0, 0, 0, 0, 0, 0, -1, 1, 0, 1]);
            gl.viewport(0, 0, canvas.width, canvas.height);
            gl.vertexAttrib1f(gl.aPointSize, pointSize);

            //set base matrix to translate canvas pixel coordinates -> webgl coordinates
            this.mapMatrix.set(this.pixelsToWebGLMatrix);

            this
                .scaleMatrix(scale, scale)
                .translateMatrix(-offset.x, -offset.y);

            // -- attach matrix value to 'mapMatrix' uniform in shader
            gl.uniformMatrix4fv(this.uMatrix, false, this.mapMatrix);
            gl.drawArrays(gl.POINTS, 0, this.settings.data.length);

            return this;
        },

        /**
         * converts latlon to pixels at zoom level 0 (for 256x256 tile size) , inverts y coord )
         * source : http://build-failed.blogspot.cz/2013/02/displaying-webgl-data-on-google-maps.html
         * @param latitude
         * @param longitude
         * @returns {{x: number, y: number}}
         */
        latLngToPixelXY: function(latitude, longitude, a){
            var pi180 = Math.PI / 180.0,
                pi4 = Math.PI * 4,
                sinLatitude = Math.sin(latitude * pi180),
                pixelY = (0.5 - Math.log((1 + sinLatitude) / (1 - sinLatitude)) / (pi4)) * 256,
                pixelX = ((longitude + 180) / 360) * 256,
                pixel,
                key = latitude.toFixed(5) + 'x' + longitude.toFixed(5),
                lookup = this.latLngLookup[key];

            pixel = {
                lat: latitude,
                lng: longitude,
                a: a,
                x: pixelX,
                y: pixelY,
                key: key
            };

            if (lookup === undefined) {
                lookup = this.latLngLookup[key] = [];
            }

            lookup.push(pixel);

            return pixel;
        },

        /**
         *
         * @param tx
         * @param ty
         * @returns {Glify}
         */
        translateMatrix: function(tx, ty) {
            var matrix = this.mapMatrix;
            // translation is in last column of matrix
            matrix[12] += matrix[0] * tx + matrix[4] * ty;
            matrix[13] += matrix[1] * tx + matrix[5] * ty;
            matrix[14] += matrix[2] * tx + matrix[6] * ty;
            matrix[15] += matrix[3] * tx + matrix[7] * ty;

            return this;
        },

        /**
         *
         * @param scaleX
         * @param scaleY
         * @returns {Glify}
         */
        scaleMatrix: function(scaleX, scaleY) {
            var matrix = this.mapMatrix;
            // scaling x and y, which is just scaling first two columns of matrix
            matrix[0] *= scaleX;
            matrix[1] *= scaleX;
            matrix[2] *= scaleX;
            matrix[3] *= scaleX;

            matrix[4] *= scaleY;
            matrix[5] *= scaleY;
            matrix[6] *= scaleY;
            matrix[7] *= scaleY;

            return this;
        },

        /**
         *
         * @param map
         * @returns {Glify}
         */
        addTo: function(map) {
            this.glLayer.addTo(map);

            return this;
        },

        /**
         * Iterates through a small area around the
         * @param {L.LatLng} coords
         * @returns {*}
         */
        lookup: function(coords) {
            var x = coords.lat - 0.0003,
                y,

                xMax = coords.lat + 0.003,
                yMax = coords.lng + 0.003,

                foundI,
                foundMax,

                matches = [],
                found,
                key;

            for (; x <= xMax; x+=0.00001) {
                y = coords.lng -0.003;
                for (; y <= yMax; y+=0.00001) {
                    key = x.toFixed(5) + 'x' + y.toFixed(5);
                    found = this.latLngLookup[key];
                    if (found) {
                        foundI = 0;
                        foundMax = found.length;
                        for (; foundI < foundMax; foundI++) {
                            found[foundI].key = key;
                            matches.push(found[foundI]);
                        }
                    }
                }
            }

            return this.closestPoint(coords, matches);
        },

        /**
         *
         * @param targetLocation
         * @param points
         * @returns {*}
         */
        closestPoint: function(targetLocation, points) {
            function vectorDistance(dx, dy) {
                return Math.sqrt(dx * dx + dy * dy);
            }

            function locationDistance(location1, location2) {
                var dx = location1.lat - location2.lat,
                    dy = location1.lng - location2.lng;

                return vectorDistance(dx, dy);
            }

            return points.reduce(function(prev, curr) {
                var prevDistance = locationDistance(targetLocation , prev),
                    currDistance = locationDistance(targetLocation , curr);
                return (prevDistance < currDistance) ? prev : curr;
            });
        },
        debugPoint: function(containerPoint) {
            var el = document.createElement('div'),
                s = el.style,
                x = containerPoint.x,
                y = containerPoint.y;

            s.left = x + 'px';
            s.top = y + 'px';
            s.width = '100px';
            s.height = '100px';
            s.position = 'absolute';
            s.backgroundColor = '#'+(Math.random()*0xFFFFFF<<0).toString(16);

            document.body.appendChild(el);

            return this;
        }
    };

    L.glify = function(settings) {
        return new L.Glify(settings);
    };

    L.Glify = Glify;
})(window, document, L);
