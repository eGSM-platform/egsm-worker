angular.module('LogCtrl', []).controller('LogController', function($scope, $http, $window, $interval) {
  $scope.updateDebugLog = function()
  {
    $http.get('api/debugLog?engine_id=' + $scope.engineId).
    success(function(data, status, headers, config) {
      $scope.log = data;
    }).
    error(function(data, status, headers, config) {
      // log error
      $window.alert('error updateDebugLog: ' + data);
    });
  }

});
