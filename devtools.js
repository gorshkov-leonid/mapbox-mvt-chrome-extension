var entries = [];
var panel;
var endOrder = 0;
var startOrder = 0;

function redrawEntries(){
	if(panel)
	{
		panel.redrawEntries(entries);
	}
}

function updateEntry(oldEntry, diff){
    Object.assign(oldEntry, diff)
	redrawEntries();
}

function addEntry(entry){
    entries.push(entry);
	redrawEntries();
}

function removeEnrty(entry){
    var entryIndex = entries.indexOf(entry);
    if(entryIndex != -1){
        entries.splice(entryIndex, 1);
    }
	redrawEntries();
}

let trackEmptyResponse, trackOnlySuccessfulResponse, mvtRequestPatternRegExp

chrome.storage.local.onChanged.addListener(function(changes){
    if(changes['trackEmptyResponse']){
        trackEmptyResponse = !!changes['trackEmptyResponse'].newValue;
    }
    if(changes['trackOnlySuccessfulResponse']){
        trackOnlySuccessfulResponse = !!changes['trackOnlySuccessfulResponse'].newValue;
    }
    if(changes['mvtRequestPattern']){
        let mvtRequestPattern = changes['mvtRequestPattern'].newValue;   
        try{
           mvtRequestPatternRegExp = new RegExp(mvtRequestPattern, "i");    
        } catch(e) {
           console.log("Mvt Request Pattern is invalid", mvtRequestPattern); 
        }
    }
});

chrome.storage.local.get(['trackEmptyResponse', 'trackOnlySuccessfulResponse', 'mvtRequestPattern'], function(r) {
    trackEmptyResponse = r.trackEmptyResponse;
    trackOnlySuccessfulResponse = r.trackOnlySuccessfulResponse;
    try{
       mvtRequestPatternRegExp = new RegExp(r.mvtRequestPattern, "i");    
    } catch(e) {
       console.log("Mvt Request Pattern is invalid", r.mvtRequestPattern); 
    }
   
   chrome.devtools.panels.create("Mapbox Vector Tiles", "images/16.png", "mvt-tiles-panel.html", function(p) {  
      p.onShown.addListener((w)=>{
   	     panel = w; 
   	     panel.onClear = (e) => {
   		   entries = [];
		   endOrder = 0;
		   startOrder = 0;
   		   redrawEntries();
   	     };
   	     redrawEntries();
      });
   
      p.onHidden.addListener((w)=>{
   	     panel = undefined; 
      });
   });

   chrome.devtools.network.onRequestFinished.addListener(
		function(httpEntry) {
		  var urlParseResult = httpEntry.request.url.match(mvtRequestPatternRegExp);
		  
		  if(!urlParseResult)
		  {
		     return;
		  }
    
		  var z = urlParseResult.groups && urlParseResult.groups.z || urlParseResult[1];
		  var x = urlParseResult.groups && urlParseResult.groups.x || urlParseResult[2];
		  var y = urlParseResult.groups && urlParseResult.groups.y || urlParseResult[3];
		  
		  if(!z || !x || !y)
		  {
		     return;
		  }		
		  
		  let nStarted = ++startOrder;
		 
          //http://qnimate.com/detecting-end-of-scrolling-in-html-element/         
          //https://stackoverflow.com/questions/8773921/how-to-automatically-scroll-down-a-html-page
	      var t = httpEntry.startedDateTime;
          
          const pendingEntry = {
              x: x, 
              y: y, 
              z: z, 
              status: -1,
              url: httpEntry.request.url, 
              startOrder: nStarted,
              json: undefined, 
              startedDateTime: httpEntry.startedDateTime, 
              time: undefined,
              endOrder: undefined,
             
          };
		  addEntry(pendingEntry); 
		  
		  httpEntry.getContent(function(content, encoding){
            const pendingEntryIndex = entries.indexOf(pendingEntry);
            if(pendingEntryIndex == -1) {
                return;
		    }
            
            var isOk = httpEntry.response.status ==200;
            var isNoContent = httpEntry.response.status ==204;
            var isSuccess = isOk || isNoContent;

			if(isNoContent && !trackEmptyResponse)
		    {	
               removeEnrty(pendingEntry);
		  	   return;
		    }	
			
            if(trackOnlySuccessfulResponse && !isSuccess)
            {
                removeEnrty(pendingEntry);
                return;
            }

            var geoJsonLayers = {};
            var jsonTile = {layers: geoJsonLayers};
            if(isOk){
                var data = Uint8Array.from(atob(content), c => c.charCodeAt(0)) ;
                if(data.length){
			        var tile = new VectorTile.VectorTile(new Pbf(data));
                    var layerNames = Object.keys(tile.layers);
                    if(layerNames.length) {
                        layerNames.forEach((layerName)=>{
                          var geoJsonLayer = geoJsonLayers[layerName] = geoJsonLayers[layerName] || {};
                          var geoJsonFeatures = geoJsonLayer.features = geoJsonLayers[layerName].features || [];
                          
                          var layer = tile.layers[layerName];
                          for(var i = 0; i < layer.length; i++)
                          {
                             geoJsonFeatures.push(layer.feature(i).toGeoJSON(x, y, z));
                          }
                        })
                    }
                    else if(!trackEmptyResponse){
                        removeEnrty(pendingEntry);
		  	            return;
                    }
                }
                else if(!trackEmptyResponse){
                   removeEnrty(pendingEntry);
		  	       return;
                }
            }

            updateEntry(pendingEntry, {
              x: x, 
              y: y,
              z: z,
              status: httpEntry.response.status, 
              time: httpEntry.time, 
              startedDateTime:  httpEntry.startedDateTime, 
              url: httpEntry.request.url, 
              tile: jsonTile,
              endOrder: ++endOrder,
              startOrder: nStarted
            })
		  })    
	});
});
