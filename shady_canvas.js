var ShadyCanvas = (function () {
    return {
        init: function (given_canvas) {
            if (!window.requestAnimationFrame) {
                window.requestAnimationFrame = (function () {
                    return window.webkitRequestAnimationFrame ||
                        window.mozRequestAnimationFrame ||
                        window.oRequestAnimationFrame ||
                        window.msRequestAnimationFrame ||
                        function (callback) {
                            window.setTimeout(callback, 1000 / 60);
                        };
                })();
            }

            var fullscreenButton,
                compileTimer,
                errorLines = [],
                code,
                canvas,
                gl,
                buffer,
                currentProgram,
                vertexPosition,
                screenVertexPosition,
                parameters = {
                    startTime: Date.now(),
                    time: 0,
                    mouseX: 0.5,
                    mouseY: 0.5,
                    screenWidth: 0,
                    screenHeight: 0
                },
                surface = {
                    centerX: 0,
                    centerY: 0,
                    width: 1,
                    height: 1,
                    isPanning: false,
                    isZooming: false,
                    lastX: 0,
                    lastY: 0
                },
                frontTarget,
                backTarget,
                screenProgram,
                getWebGL,
                compileOnChangeCode = true;

            canvas = given_canvas;
            try {
                gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
            } catch (error) {
            }
            if (gl) {
                // enable dFdx, dFdy, fwidth
                gl.getExtension('OES_standard_derivatives');
                // Create vertex buffer (2 triangles)
                buffer = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0]), gl.STATIC_DRAW);
                // Create surface buffer (coordinates at screen corners)
                surface.buffer = gl.createBuffer();
            }

// Create render targets
            parameters.screenWidth = canvas.width;
            parameters.screenHeight = canvas.height;
            surface.width = surface.height * parameters.screenWidth / parameters.screenHeight;
            var halfWidth = surface.width * 0.5, halfHeight = surface.height * 0.5;
            gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                surface.centerX - halfWidth, surface.centerY - halfHeight,
                surface.centerX + halfWidth, surface.centerY - halfHeight,
                surface.centerX - halfWidth, surface.centerY + halfHeight,
                surface.centerX + halfWidth, surface.centerY - halfHeight,
                surface.centerX + halfWidth, surface.centerY + halfHeight,
                surface.centerX - halfWidth, surface.centerY + halfHeight]), gl.STATIC_DRAW);
            gl.viewport(0, 0, canvas.width, canvas.height);
            frontTarget = createTarget(parameters.screenWidth, parameters.screenHeight);
            backTarget = createTarget(parameters.screenWidth, parameters.screenHeight);

// Compile screen function
            var program = gl.createProgram();
            var fragment = document.getElementById('fragmentShader').textContent;
            var vertex = document.getElementById('vertexShader').textContent;
            var vs = createShader(vertex, gl.VERTEX_SHADER);
            var fs = createShader(fragment, gl.FRAGMENT_SHADER);
            gl.attachShader(program, vs);
            gl.attachShader(program, fs);
            gl.deleteShader(vs);
            gl.deleteShader(fs);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('VALIDATE_STATUS: ' + gl.getProgramParameter(program, gl.VALIDATE_STATUS), 'ERROR: ' + gl.getError());
            }
            screenProgram = program;
            gl.useProgram(screenProgram);
            screenVertexPosition = gl.getAttribLocation(screenProgram, "position");
            gl.enableVertexAttribArray(screenVertexPosition);


            if (gl) {
                animate();
            }

            function computeSurfaceCorners() {
                if (gl) {
                    surface.width = surface.height * parameters.screenWidth / parameters.screenHeight;
                    var halfWidth = surface.width * 0.5, halfHeight = surface.height * 0.5;
                    gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
                    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
                        surface.centerX - halfWidth, surface.centerY - halfHeight,
                        surface.centerX + halfWidth, surface.centerY - halfHeight,
                        surface.centerX - halfWidth, surface.centerY + halfHeight,
                        surface.centerX + halfWidth, surface.centerY - halfHeight,
                        surface.centerX + halfWidth, surface.centerY + halfHeight,
                        surface.centerX - halfWidth, surface.centerY + halfHeight]), gl.STATIC_DRAW);
                }
            }

            function compile() {
                if (!gl) {
                    return;
                }

                var program = gl.createProgram();
                var fragment = document.getElementById("fragment-shader").textContent;
                var vertex = document.getElementById('surfaceVertexShader').textContent;

                var vs = createShader(vertex, gl.VERTEX_SHADER);
                var fs = createShader(fragment, gl.FRAGMENT_SHADER);

                if (vs == null || fs == null) return null;

                gl.attachShader(program, vs);
                gl.attachShader(program, fs);

                gl.deleteShader(vs);
                gl.deleteShader(fs);

                gl.linkProgram(program);

                if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                    var error = gl.getProgramInfoLog(program);
                    console.error(error);
                    console.error('VALIDATE_STATUS: ' + gl.getProgramParameter(program, gl.VALIDATE_STATUS), 'ERROR: ' + gl.getError());
                    return;
                }

                if (currentProgram) {
                    gl.deleteProgram(currentProgram);
                    setURL(fragment);
                }

                currentProgram = program;
                gl.useProgram(currentProgram);
                surface.positionAttribute = gl.getAttribLocation(currentProgram, "surfacePosAttrib");
                gl.enableVertexAttribArray(surface.positionAttribute);
                vertexPosition = gl.getAttribLocation(currentProgram, "position");
                gl.enableVertexAttribArray(vertexPosition);
            }

            function createTarget(width, height) {

                var target = {};

                target.framebuffer = gl.createFramebuffer();
                target.renderbuffer = gl.createRenderbuffer();
                target.texture = gl.createTexture();

                // set up framebuffer

                gl.bindTexture(gl.TEXTURE_2D, target.texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);

                gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);

                // set up renderbuffer

                gl.bindRenderbuffer(gl.RENDERBUFFER, target.renderbuffer);

                gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, width, height);
                gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, target.renderbuffer);

                // clean up

                gl.bindTexture(gl.TEXTURE_2D, null);
                gl.bindRenderbuffer(gl.RENDERBUFFER, null);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);

                return target;
            }

            function createShader(src, type) {
                var shader = gl.createShader(type);
                var line, lineNum, lineError, index = 0, indexEnd;

                while (errorLines.length > 0) {
                    line = errorLines.pop();
                }

                gl.shaderSource(shader, src);
                gl.compileShader(shader);

                if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                    var error = gl.getShaderInfoLog(shader);

                    // Remove trailing linefeed, for FireFox's benefit.
                    while ((error.length > 1) && (error.charCodeAt(error.length - 1) < 32)) {
                        error = error.substring(0, error.length - 1);
                    }

                    console.error(error);

                    while (index >= 0) {
                        index = error.indexOf("ERROR: 0:", index);
                        if (index < 0) {
                            break;
                        }
                        index += 9;
                        indexEnd = error.indexOf(':', index);
                        if (indexEnd > index) {
                            lineNum = parseInt(error.substring(index, indexEnd));
                            if ((!isNaN(lineNum)) && (lineNum > 0)) {
                                index = indexEnd + 1;
                                indexEnd = error.indexOf("ERROR: 0:", index);
                                lineError = htmlEncode((indexEnd > index) ? error.substring(index, indexEnd) : error.substring(index));
                            }
                        }
                    }
                    return null;
                }
                return shader;
            }

            function animate() {
                requestAnimationFrame(animate);
                render();
            }

            function render() {
                if (!currentProgram)
                    return;

                parameters.time = Date.now() - parameters.startTime;

                // Set uniforms for custom shader
                gl.useProgram(currentProgram);
                gl.uniform1f(gl.getUniformLocation(currentProgram, 'time'), parameters.time / 1000);
                gl.uniform2f(gl.getUniformLocation(currentProgram, 'mouse'), parameters.mouseX, parameters.mouseY);
                gl.uniform2f(gl.getUniformLocation(currentProgram, 'resolution'), parameters.screenWidth, parameters.screenHeight);
                gl.uniform1i(gl.getUniformLocation(currentProgram, 'backbuffer'), 0);
                gl.uniform2f(gl.getUniformLocation(currentProgram, 'surfacesize'), surface.width, surface.height);
                gl.bindBuffer(gl.ARRAY_BUFFER, surface.buffer);
                gl.vertexAttribPointer(surface.positionAttribute, 2, gl.FLOAT, false, 0, 0);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.vertexAttribPointer(vertexPosition, 2, gl.FLOAT, false, 0, 0);
                gl.activeTexture(gl.TEXTURE0);
                gl.bindTexture(gl.TEXTURE_2D, backTarget.texture);

                // Render custom shader to front buffer
                gl.bindFramebuffer(gl.FRAMEBUFFER, frontTarget.framebuffer);

                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLES, 0, 6);

                // Set uniforms for screen shader
                gl.useProgram(screenProgram);
                gl.uniform2f(gl.getUniformLocation(screenProgram, 'resolution'), parameters.screenWidth, parameters.screenHeight);
                gl.uniform1i(gl.getUniformLocation(screenProgram, 'texture'), 1);
                gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
                gl.vertexAttribPointer(screenVertexPosition, 2, gl.FLOAT, false, 0, 0);
                gl.activeTexture(gl.TEXTURE1);
                gl.bindTexture(gl.TEXTURE_2D, frontTarget.texture);
                gl.bindFramebuffer(gl.FRAMEBUFFER, null);
                gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
                gl.drawArrays(gl.TRIANGLES, 0, 6);

                // Swap buffers
//        var tmp = frontTarget;
//        frontTarget = backTarget;
//        backTarget = tmp;
            }

            compile();
        }
    };
}());