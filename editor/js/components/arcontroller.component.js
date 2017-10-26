function ArControllerComponent( o )
{
    this.farPlane = 1000;
    this.nearPlane= 0.01;
    this.defaultMarkerWidth = 40;
    this.cameraCalibrationFile = 'data/camera_para.dat';
    this._video = undefined;
    this._arTrackable2DList = [];
    this._defaultMarkerWidthUnit = 'mm';
    this._visibleTrackables = [];
    this.initVideo = true;
    //Square tracking options
    this.trackableDetectionModeList = {
        'Trackable square pattern (color)' : artoolkit.AR_TEMPLATE_MATCHING_COLOR,
        'Trackable square pattern (mono)' : artoolkit.AR_TEMPLATE_MATCHING_MONO,
        'Trackable square barcode' : artoolkit.AR_MATRIX_CODE_DETECTION,
        'Trackable square pattern and barcode (color)' : artoolkit.AR_TEMPLATE_MATCHING_COLOR_AND_MATRIX,
        'Trackable square pattern and barcode (mono)' : artoolkit.AR_TEMPLATE_MATCHING_MONO_AND_MATRIX
    };    
    
    this.trackableDetectionMode = artoolkit.AR_TEMPLATE_MATCHING_COLOR_AND_MATRIX;
    
    LEvent.bind(LS.GlobalScene, "onTrackableFound", this.trackableFound);
    LEvent.bind(LS.GlobalScene, "onTrackableLost", this.trackableLost);
    

    if(o)
    	this.configure(o);
}

ArControllerComponent.arCameraName = 'arcamera';

ArControllerComponent["@inspector"] = function( arController, inspector )
{   
    inspector.addTitle("AR Controller");
    inspector.addCombo("Trackable detection mode", arController.trackableDetectionMode, { values: arController.trackableDetectionModeList, callback: function (value) { arController.trackableDetectionMode = value }});
    
    inspector.addNumber("Far plane", arController.farPlane, {callback: v => arController.farPlane = v, precision:2, step:1});
    inspector.addNumber("Near plane", arController.nearPlane, {callback: v => arController.nearPlane = v, precision:2, step:0.01});
    
    inspector.addNumber("Trackable width", arController.defaultMarkerWidth, {callback: v => arController.defaultMarkerWidth = v, precision:0, step:1, units: arController._defaultMarkerWidthUnit, min: 10});
}

LS.registerComponent(ArControllerComponent);

ArControllerComponent.prototype.onAddedToScene = function( scene ){
    LEvent.bind(scene,"start",this.startAR,this);
    LEvent.bind(scene,'finish',this.stopAR, this );
}
ArControllerComponent.prototype.onRemovedFromScene = function( scene ) {
    //LEvent.bind(scene,"stop",this.stopAR,this);    
}

ArControllerComponent.prototype.startAR = function() {
    console.log("Start AR");

    let scene = LS.GlobalScene;

    // Read the marker-root from the LiteScene

    this._video = ARController.getUserMedia({
        maxARVideoSize: 320, // do AR processing on scaled down video of this size
        facing: "environment",
        onSuccess: function(stream) {
            console.log('got video', stream);
            var cameraPara = new ARCameraParam(this.cameraCalibrationFile);
            cameraPara.onload = function() {
                var arController = new ARController(this._video.videoWidth, this._video.videoHeight, cameraPara);
                arController.setDefaultMarkerWidth(this.defaultMarkerWidth);
                console.log('ARController ready for use', arController);
                
                // FIXME: In Player-Mode the detection Mode is undefined 
                arController.setPatternDetectionMode( (this.trackableDetectionMode || 3) );     

                // Add an event listener to listen to getMarker events on the ARController.
                // Whenever ARController#process detects a marker, it fires a getMarker event
                // with the marker details.
                arController.addEventListener('getMarker',this.onTrackableFound.bind(this));         

                // Camera matrix is used to define the “perspective” that the camera would see.
                // The camera matrix returned from arController.getCameraMatrix() is already the OpenGLProjectionMatrix
                // LiteScene supports setting a custom projection matrix but an update of LiteScene is needed to do that.
                //FIX ME: arCamera.setCustomProjectionMatrix(arController.getCameraMatrix());

                for (var trackable2D of this._arTrackable2DList){

                    if(trackable2D._trackableType==trackable2D.trackableTypes[1])
                    {
                        this.arController.loadMarker(trackable2D.trackablePath, function(markerId) {
                                        console.log("Register trackable - Pattern");
                                        trackable2D.trackableId = markerId;
                                    });
                    }
                }

                // On each frame, detect markers, update their positions and
                // render the frame on the renderer.
                var tick = function() {
                    requestAnimationFrame(tick);

                    if(this.initVideo)
                    {
                        if((this._video.videoWidth>0)&&(this._video.videoHeight>0))
                        {
                            const sceneRoot = LS.GlobalScene.root;

                            let arBackgroundCameraNode = new LS.SceneNode("arbackgroundcamera");
                            let arBackgroundCamera = new LS.Camera();
                            arBackgroundCamera.type = 2; //Apply orthographic projection to this camera.
                            arBackgroundCameraNode.transform.rotate(180, [0,1,0]);
                            arBackgroundCameraNode.addComponent(arBackgroundCamera);
                            sceneRoot.addChild(arBackgroundCameraNode);

                            let arBackgroundNode = new LS.SceneNode("arbackground");
                            sceneRoot.addChild(arBackgroundNode, 0);

                            //Attached ARControllerComponent to scene root
                            const arControllerComponent = new ArControllerComponent();
                            sceneRoot.addComponent(arControllerComponent, 0);

                            //texture = initTexture(gl);
                            //let textureVideo = GL.Texture.fromVideo(video);
                            var background  = new LS.Components.GeometricPrimitive();
                            background.geometry = LS.Components.GeometricPrimitive.PLANE;
                            //background.size = 100;
                            //Translate node so that it is positioned on the first background camera.
                            arBackgroundNode.material = new LS.StandardMaterial({flags:{ignore_lights:true}});
                            arBackgroundNode.addComponent(background);
                            arBackgroundNode.setPropertyValue("translate.Z", 100);
                            arBackgroundNode.setPropertyValue("xrotation", -90);
                            arBackgroundNode.setPropertyValue("yrotation", 180);
                            arBackgroundNode.transform.scale(6.25, 1, 5);


                            var videoPlayer = new LS.Components.VideoPlayer();
                            videoPlayer.video = this._video;
                            videoPlayer.render_mode = LS.Components.VideoPlayer.TO_MATERIAL;
                            //videoPlayer.src = "http://localhost:8080/big_buck_bunny.mp4";
                            arBackgroundNode.addComponent(videoPlayer);

                            //Add the AR-Camera to the scene
                            let arCameraNode = new LS.SceneNode(ArControllerComponent.arCameraName);
                            let arCamera = new LS.Camera();
                            arCamera.background_color=[0, 0, 0, 0];
                            arCamera.clear_color = false; //Do not clear buffer from first camera.
                            arCameraNode.addComponent(arCamera);
                            sceneRoot.addChild(arCameraNode, 0);

                            this.initVideo= false;
                        }
                    }

                    // Hide the marker, as we don't know if it's visible in this frame.
                    for (var trackable2D of this._arTrackable2DList){
                        trackable2D.currentState = undefined;
                    }

                    // Process detects markers in the video frame and sends
                    // getMarker events to the event listeners.
                    arController.process(this._video);

                    // If after the processing trackable2D.currentState is still undefined we assume that the marker was not visible within that frame

                    this._arTrackable2DList.forEach(arTrackable => {
                        if( arTrackable.currentState === undefined){
                            arTrackable.visible = false;
                        }
                    });
                    
                    // Render the updated scene.
                    LS.GlobalScene.refresh();
                    //renderer.render(scene, camera);
                }.bind(this);
                tick();

            }.bind(this);
        }.bind(this)
    });
};

ArControllerComponent.prototype.stopAR = function(){
    console.log("Stop AR");    
    if(this._video !== undefined){
        this._video.srcObject.getTracks()[0].stop();
    }
};

ArControllerComponent.prototype.registerTrackable = function(arTrackable2D){
    console.log("Register trackable");
    this._arTrackable2DList.push(arTrackable2D);
}

ArControllerComponent.prototype.unRegisterTrackable = function(arTrackable2D){
    console.log(`Unregister trackable`);
    const indexToRemove = this._arTrackable2DList.indexOf(arTrackable2D);
    if(indexToRemove > -1) {
        this._arTrackable2DList.splice(indexToRemove,1);
    }
}

ArControllerComponent.prototype.onTrackableFound = function (ev){
    const markerIndex = ev.data.index;
    const markerType = ev.data.type;
    const marker = ev.data.marker;
    //Look for a barcode trackable
    const trackableId = ev.data.marker.idMatrix;
    //Look for a pattern trackable
    if(trackableId === undefined || trackableId < 0) {
        const trackableId = ev.data.marker.idPatt;
    }
    
    if (trackableId !== -1) {
        console.log("saw a trackable with id", trackableId);

        this._arTrackable2DList.forEach(arTrackable => {
            if(trackableId === arTrackable.trackableId) {
                let markerRoot = arTrackable.attachedGameObject;
                arTrackable.visible = true;
                arTrackable.currentState = 'visible';
                
                // Note that you need to copy the values of the transformation matrix,
                // as the event transformation matrix is reused for each marker event
                // sent by an ARController.
                var transform = ev.data.matrix;
                // console.log(transform);

                // Apply transform to marker root
                scene_arCameraNode= LS.GlobalScene.getNodeByName( ArControllerComponent.arCameraName );

                let cameraGlobalMatrix = scene_arCameraNode.transform.getGlobalMatrix();
                let markerRootMatrix = mat4.create();
                mat4.multiply(markerRootMatrix,cameraGlobalMatrix,transform);
                let outQuat = quat.create();
                quat.fromMat4(outQuat,markerRootMatrix);
                outQuat[0]*=-1;
                markerRoot.transform.setPosition(vec3.fromValues(markerRootMatrix[12],markerRootMatrix[13]*-1,markerRootMatrix[14]*-1));
                markerRoot.transform.setRotation(outQuat);
            } // end if(trackableId === arTrackable.trackableId)
        });
    }
};

ArControllerComponent.prototype.trackableFound = (event, arTrackable) => {
    console.log(`TrackableID ${arTrackable.trackableId}`);    
}

ArControllerComponent.prototype.trackableLost = (event, arTrackable) => {
    console.log(`TrackableId ${arTrackable.trackableId}`);
}