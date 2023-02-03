angular.module('MainCtrl', []).controller('MainController', function ($scope, $http, $window, $interval) {

	const queryString = window.location.search;
	if(queryString.length > 0){
	  const urlParams = new URLSearchParams(queryString);
	  document.getElementById("engine_id_textbox").value = urlParams.get('engine_id');
	  $scope.engineId = urlParams.get('engine_id')
	}
	
	$scope.tagline = 1;//'To the moon and back!';

	$interval(function () {
		if ($scope.ENGINE_ID != '') {
			$scope.tagline++;
			$http.get('api/guards?engine_id=' + $scope.engineId).
				success(function (data, status, headers, config) {
					$scope.guards = data;
				}).
				error(function (data, status, headers, config) {
					// log error
				});

			$http.get('api/stages?engine_id=' + $scope.engineId).
				success(function (data, status, headers, config) {
					$scope.stages = data;
				}).
				error(function (data, status, headers, config) {
					// log error
				});

			$http.get('api/environments?engine_id=' + $scope.engineId).
				success(function (data, status, headers, config) {
					$scope.environments = data;
				}).
				error(function (data, status, headers, config) {
					// log error
				});

			$http.get('api/config_stages?engine_id=' + $scope.engineId).
				success(function (data, status, headers, config) {
					$scope.config_stages = data;
				}).
				error(function (data, status, headers, config) {
					// log error
				});
		}
	}, 1000);
});
