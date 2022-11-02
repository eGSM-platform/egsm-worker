angular.module('ProcessCtrl', []).controller('ProcessController', function ($scope, $http, $window, $interval) {
  $scope.model = new go.GraphLinksModel([], []);

  $http.get('api/config_stages_diagram?engine_id=' + $scope.engineId).
    success(function (data, status, headers, config) {
      $scope.config_stages = data;

      $scope.model = new go.GraphLinksModel($scope.config_stages, []);
      $scope.model.selectedNodeData = null;
    }).
    error(function (data, status, headers, config) {
      console.log('error: ' + data);
    });


  $interval(function () {
    $http.get('api/config_stages_diagram?engine_id=' + $scope.engineId).
      success(function (data, status, headers, config) {
        $scope.config_stages = data;
        var model = $scope.model;

        for (var key in model.nodeDataArray) {
          function findStage(stage) {
            return stage.name === model.nodeDataArray[key].name;
          }
          var stage = $scope.config_stages.find(findStage);
          if (stage != undefined) {
            //model.selectedNodeData = model.nodeDataArray[key];
            var data = model.nodeDataArray[key];  // get the first node data
            model.setDataProperty(data, "color", stage.color);
          }
        }
      }).
      error(function (data, status, headers, config) {
        console.log('error: ' + data);
      });
  }, 2000);

})

  .directive('goDiagram', function () {
    return {
      restrict: 'E',
      template: '<div></div>',  // just an empty DIV element
      replace: true,
      scope: { model: '=goModel' },
      link: function (scope, element, attrs) {

        var UnselectedBrush = "lightgray";  // item appearance, if not "selected"
        var SelectedBrush = "dodgerblue";   // item appearance, if "selected"
        function makeItemTemplate(leftside) {
          return $(go.Panel, "Auto",
            { margin: new go.Margin(1, 0) },  // some space between ports
            $(go.Shape,
              {
                name: "SHAPE",
                fill: UnselectedBrush, stroke: "gray",
                geometryString: "F1 m 0,0 l 5,0 1,4 -1,4 -5,0 1,-4 -1,-4 z",
                spot1: new go.Spot(0, 0, 5, 1),  // keep the text inside the shape
                spot2: new go.Spot(1, 1, -5, 0),
                // some port-related properties
                toSpot: go.Spot.Left,
                toLinkable: leftside,
                fromSpot: go.Spot.Right,
                fromLinkable: !leftside,
                cursor: "pointer"
              },
              new go.Binding("portId", "name")),
            $(go.TextBlock,
              new go.Binding("text", "name"),
              { // allow the user to select items -- the background color indicates whether "selected"
                isActionable: true,
                //?? maybe this should be more sophisticated than simple toggling of selection
                click: function (e, tb) {
                  var shape = tb.panel.findObject("SHAPE");
                  if (shape !== null) {
                    // don't record item selection changes
                    var oldskips = shape.diagram.skipsUndoManager;
                    shape.diagram.skipsUndoManager = true;
                    // toggle the Shape.fill
                    if (shape.fill === UnselectedBrush) {
                      shape.fill = SelectedBrush;
                    } else {
                      shape.fill = UnselectedBrush;
                    }
                    shape.diagram.skipsUndoManager = oldskips;
                  }
                }
              })
          );
        }




        var $ = go.GraphObject.make;
        var diagram =  // create a Diagram for the given HTML DIV element
          $(go.Diagram, element[0],
            {
              nodeTemplate: $(go.Node, "Auto",
                { locationSpot: go.Spot.Center },
                new go.Binding("location", "loc", go.Point.parse).makeTwoWay(go.Point.stringify),
                $(go.Shape, "RoundedRectangle", new go.Binding("fill", "color"),
                  {
                    portId: "", cursor: "pointer",
                    fromLinkable: true, toLinkable: true,
                    fromLinkableSelfNode: true, toLinkableSelfNode: true,
                    fromLinkableDuplicates: true, toLinkableDuplicates: true
                  }),
                $(go.TextBlock, { margin: 3 },
                  new go.Binding("text", "name").makeTwoWay())
              ),
              linkTemplate: $(go.Link,
                { relinkableFrom: true, relinkableTo: true },
                $(go.Shape),
                $(go.Shape, { toArrow: "OpenTriangle" })
              ),
              initialContentAlignment: go.Spot.Center,
              "ModelChanged": updateAngular,
              "undoManager.isEnabled": true,
              groupTemplate: $(go.Group, "Vertical",
                $(go.Panel, "Auto",
                  $(go.Shape, "RoundedRectangle", new go.Binding("fill", "color"),  // surrounds the Placeholder
                    { parameter1: 14 }),
                  $(go.Placeholder,    // represents the area of all member parts,
                    { padding: 5 })  // with some extra padding around them
                ),
                $(go.TextBlock,         // group title
                  { alignment: go.Spot.Right, font: "Bold 12pt Sans-Serif" },
                  new go.Binding("text", "key"))
              )
            });
        // whenever a GoJS transaction has finished modifying the model, update all Angular bindings
        function updateAngular(e) {
          if (e.isTransactionFinished) scope.$apply();
        }
        // notice when the value of "model" changes: update the Diagram.model
        scope.$watch("model", function (newmodel) {
          console.log("cambiato model: ");
          var oldmodel = diagram.model;
          if (oldmodel !== newmodel) {
            diagram.model = newmodel;
          }
        });
        scope.$watch("model.selectedNodeData.name", function (newname) {
          // disable recursive updates
          diagram.removeModelChangedListener(updateAngular);
          // change the name
          diagram.startTransaction("change name");
          // the data property has already been modified, so setDataProperty would have no effect
          var node = diagram.findNodeForData(diagram.model.selectedNodeData);
          if (node !== null) node.updateTargetBindings("name");
          diagram.commitTransaction("change name");
          // re-enable normal updates
          diagram.addModelChangedListener(updateAngular);
        });
        scope.$watch("model.selectedNodeData.color", function (newname) {
          // disable recursive updates
          diagram.removeModelChangedListener(updateAngular);
          // change the name
          diagram.startTransaction("change color");
          // the data property has already been modified, so setDataProperty would have no effect
          var node = diagram.findNodeForData(diagram.model.selectedNodeData);
          if (node !== null) node.updateTargetBindings("color");
          diagram.commitTransaction("change color");
          // re-enable normal updates
          diagram.addModelChangedListener(updateAngular);
        });
        // update the model when the selection changes
        diagram.addDiagramListener("ChangedSelection", function (e) {
          var selnode = diagram.selection.first();
          diagram.model.addModelChangedListenerData = (selnode instanceof go.Node ? selnode.data : null);
          scope.$apply();
        });
      }
    };
  });
