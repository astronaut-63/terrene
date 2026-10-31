import { useEffect, useRef, useState } from 'react';
import {
  BoundingSphere, Cartesian2, Cartesian3, Cartographic, CesiumTerrainProvider,
  Color, Credit, DistanceDisplayCondition, EllipsoidTerrainProvider, Entity, HeadingPitchRange, HeightReference,
  ImageryLayer, IonImageryProvider, IonResource, LabelStyle, Math as CesiumMath, Rectangle, ScreenSpaceEventHandler,
  ScreenSpaceEventType, TileMapServiceImageryProvider, Viewer, buildModuleUrl,
} from 'cesium';
import 'cesium/Build/Cesium/Widgets/widgets.css';
import type { EarthGlobeProps, GlobeCamera, GlobeLabelsStatus, GlobeStatus } from './contracts';
import { markerPlan, validCoordinates } from './logic';
import { attachSearch } from './search';

export function EarthGlobe(props: EarthGlobeProps) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef(props);
  latest.current = props;
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [fatal, setFatal] = useState('');
  const labelsLayer = useRef<ImageryLayer | null>(null);
  const restoreSelection = useRef(!!props.initialCamera?.eye);
  const detailedTilesAvailable = useRef(false);
  const detailCoverage = useRef<Rectangle | null>(null);
  const handledFit = useRef(props.fitRouteRequest ?? 0);

  useEffect(() => {
    let disposed = false;
    let degraded = false;
    let broken = false;
    let instance: Viewer | undefined;
    const cleanups: (() => void)[] = [];
    const status = (value: GlobeStatus) => { if (!disposed) latest.current.onStatusChange?.(value); };
    const labelsStatus = (value: GlobeLabelsStatus) => { if (!disposed) latest.current.onLabelsStatusChange?.(value); };
    const fail = (code: string, message: string) => {
      if (disposed) return;
      degraded = true;
      latest.current.onError?.({ code, message });
      if (!broken) status('degraded');
    };
    status('initializing');
    detailedTilesAvailable.current = false;
    latest.current.onImageryStatusChange?.('fallback');
    setFatal('');
    try {
      instance = new Viewer(container.current!, {
        baseLayer: false, terrainProvider: new EllipsoidTerrainProvider(),
        animation: false, timeline: false, geocoder: false, homeButton: false,
        baseLayerPicker: false, sceneModePicker: false, navigationHelpButton: false,
        fullscreenButton: false, infoBox: false, selectionIndicator: false,
        requestRenderMode: true, maximumRenderTimeChange: Infinity,
      });
      const v = instance;
      setViewer(v);
      v.scene.globe.baseColor = Color.fromCssColorString('#254c61');
      v.scene.globe.depthTestAgainstTerrain = true;
      // Bundled Natural Earth has no city-scale tile pyramid.
      v.scene.screenSpaceCameraController.minimumZoomDistance = 2_500_000;
      const initial = latest.current.initialCamera;
      if (initial) {
        if (initial.eye && validCoordinates(initial.eye)) v.camera.setView({ destination: Cartesian3.fromDegrees(initial.eye.longitude, initial.eye.latitude, Math.max(2_500_000, initial.eye.heightMeters ?? 20_000_000)), orientation: { heading: CesiumMath.toRadians(initial.headingDegrees ?? 0), pitch: CesiumMath.toRadians(initial.pitchDegrees ?? -60), roll: 0 } });
        else if (validCamera(initial)) aim(v, initial, false);
        else fail('INVALID_CAMERA', 'Initial camera contains invalid coordinates, range or angles.');
      } else v.camera.setView({ destination: Cartesian3.fromDegrees(20, 20, 20_000_000) });
      cleanups.push(v.scene.renderError.addEventListener(() => {
        broken = true;
        setFatal('The Earth renderer stopped. Reload the page or try a WebGL-capable browser.');
        latest.current.onError?.({ code: 'RENDER_ERROR', message: 'Cesium rendering failed.' });
        status('error');
      }));
      const handler = new ScreenSpaceEventHandler(v.canvas);
      handler.setInputAction((event: { position: Cartesian2 }) => {
        const picked = v.scene.pick(event.position);
        if (picked?.id instanceof Entity && picked.id.id.startsWith('marker:')) {
          latest.current.onMarkerSelected?.(picked.id.id.slice(7));
          return;
        }
        const ray = v.camera.getPickRay(event.position);
        let position = ray ? v.scene.globe.pick(ray, v.scene) : undefined;
        if (!position) position = v.camera.pickEllipsoid(event.position, v.scene.globe.ellipsoid);
        if (!position) return;
        const point = Cartographic.fromCartesian(position);
        const coordinates = { latitude: CesiumMath.toDegrees(point.latitude), longitude: CesiumMath.toDegrees(point.longitude), heightMeters: point.height };
        if (validCoordinates(coordinates)) latest.current.onCoordinatesSelected?.(coordinates);
      }, ScreenSpaceEventType.LEFT_CLICK);
      cleanups.push(() => handler.destroy());
      const resize = new ResizeObserver(() => { if (!disposed) { v.resize(); v.scene.requestRender(); } });
      resize.observe(container.current!);
      cleanups.push(() => resize.disconnect());
      const reportCamera = () => {
        if (v.isDestroyed()) return;
        const cartographic = Cartographic.fromCartesian(v.camera.positionWC);
        latest.current.onCameraChange?.({
          eye: { latitude: CesiumMath.toDegrees(cartographic.latitude), longitude: CesiumMath.toDegrees(cartographic.longitude), heightMeters: cartographic.height },
          center: { latitude: CesiumMath.toDegrees(cartographic.latitude), longitude: CesiumMath.toDegrees(cartographic.longitude), heightMeters: cartographic.height },
          rangeMeters: Math.max(1, cartographic.height),
          headingDegrees: CesiumMath.toDegrees(v.camera.heading),
          pitchDegrees: CesiumMath.toDegrees(v.camera.pitch),
        });
      };
      const cameraChanged = (v.camera as Viewer['camera'] & { changed?: { addEventListener: (listener: () => void) => () => void } }).changed;
      if (cameraChanged) cleanups.push(cameraChanged.addEventListener(reportCamera));

      const token = import.meta.env.VITE_CESIUM_ION_TOKEN?.trim();
      const imageryId = Number(import.meta.env.VITE_CESIUM_ION_IMAGERY_ASSET_ID);
      const labelsId = Number(import.meta.env.VITE_CESIUM_ION_LABELS_ASSET_ID);
      const labelsConfigured = !!token && Number.isSafeInteger(labelsId) && labelsId > 0 && labelsId !== imageryId;
      labelsStatus(labelsConfigured ? 'loading' : 'unavailable');
      if (token) {
        try { cleanups.push(attachSearch(v, token, () => fail('GEOCODER_FAILED', 'Location search is unavailable. Check geocode permission and network access.'))); }
        catch { fail('GEOCODER_FAILED', 'Location search could not initialize; globe navigation remains available.'); }
      }
      else fail('ION_UNCONFIGURED', 'Using bundled Natural Earth imagery and ellipsoid terrain. Ion search and terrain require a token.');

      void (async () => {
        try {
          const fallback = await TileMapServiceImageryProvider.fromUrl(buildModuleUrl('Assets/Textures/NaturalEarthII'), { credit: new Credit('Natural Earth (public domain)') });
          if (disposed) return;
          cleanups.push(fallback.errorEvent.addEventListener(() => fail('FALLBACK_IMAGERY_FAILED', 'Bundled imagery failed to load; ellipsoid navigation remains available.')));
          v.imageryLayers.addImageryProvider(fallback);
        } catch { fail('FALLBACK_IMAGERY_FAILED', 'Bundled imagery is unavailable; check Cesium static asset hosting.'); }
        if (disposed) return;
        if (token && Number.isSafeInteger(imageryId) && imageryId > 0) {
          latest.current.onImageryStatusChange?.('loading');
          try {
            const imagery = await IonImageryProvider.fromAssetId(imageryId, { accessToken: token });
            if (disposed) return;
            detailCoverage.current = imagery.rectangle ?? null;
            let receivedTile = false;
            let imageryFailed = false;
            const originalRequest = imagery.requestImage;
            imagery.requestImage = function (...args: Parameters<typeof originalRequest>) {
              const pending = originalRequest.apply(this, args);
              if (!pending) return pending;
              return Promise.resolve(pending).then(image => {
                if (disposed) return image;
                const discard = imagery.tileDiscardPolicy;
                // Cesium's policy typing is narrower than its getImagePixels implementation.
                const usable = image && (!discard || (discard.isReady() && !discard.shouldDiscardImage(image as HTMLImageElement)));
                if (!disposed && usable) { receivedTile = true; v.scene.requestRender(); }
                return image;
              });
            };
            cleanups.push(() => { imagery.requestImage = originalRequest; });
            const layer = v.imageryLayers.addImageryProvider(imagery);
            cleanups.push(v.scene.postRender.addEventListener(() => {
              const selected = latest.current.selectedLocation;
              if (selected && imagery.rectangle && !Rectangle.contains(imagery.rectangle, Cartographic.fromDegrees(selected.coordinates.longitude, selected.coordinates.latitude))) {
                if (detailedTilesAvailable.current) detailedTilesAvailable.current = false;
                v.scene.screenSpaceCameraController.minimumZoomDistance = 2_500_000;
                latest.current.onImageryStatusChange?.('outside_coverage');
                return;
              }
              if (!disposed && !imageryFailed && receivedTile && layer.show && v.scene.globe.tilesLoaded && !detailedTilesAvailable.current) {
                detailedTilesAvailable.current = true;
                v.scene.screenSpaceCameraController.minimumZoomDistance = 100;
                latest.current.onImageryStatusChange?.('available');
              }
            }));
            cleanups.push(imagery.errorEvent.addEventListener(() => {
              imageryFailed = true;
              detailedTilesAvailable.current = false;
              latest.current.onImageryStatusChange?.('failed');
              v.scene.screenSpaceCameraController.minimumZoomDistance = 2_500_000;
              const eye = v.camera.positionCartographic;
              if (eye && eye.height < 2_500_000) v.camera.setView({ destination: Cartesian3.fromRadians(eye.longitude, eye.latitude, 5_000_000), orientation: { heading: v.camera.heading, pitch: -Math.PI / 2, roll: 0 } });
              layer.show = false;
              fail('ION_IMAGERY_FAILED', 'Ion imagery failed; showing bundled Natural Earth imagery.');
              v.scene.requestRender();
            }));
          } catch (error) { latest.current.onImageryStatusChange?.('failed'); fail('ION_IMAGERY_FAILED', imageryFailureMessage(error)); }
        } else fail('ION_IMAGERY_UNCONFIGURED', 'Regional Natural Earth fallback: city detail is unavailable. Set VITE_CESIUM_ION_TOKEN and a permitted VITE_CESIUM_ION_IMAGERY_ASSET_ID in local Vite configuration, then restart Vite.');
        if (labelsConfigured && !disposed) {
          try {
            const labelsImagery = await IonImageryProvider.fromAssetId(labelsId, { accessToken: token });
            if (disposed || v.isDestroyed()) return;
            const layer = v.imageryLayers.addImageryProvider(labelsImagery);
            layer.show = latest.current.showLabels !== false;
            labelsLayer.current = layer;
            labelsStatus(layer.show ? 'enabled' : 'hidden');
            cleanups.push(labelsImagery.errorEvent.addEventListener(() => {
              layer.show = false;
              labelsStatus('failed');
              labelsLayer.current = null;
              fail('ION_LABELS_FAILED', 'Map labels failed to load; base imagery remains available.');
              v.scene.requestRender();
            }));
            cleanups.push(() => {
              if (labelsLayer.current === layer) labelsLayer.current = null;
              if (!v.isDestroyed()) v.imageryLayers.remove(layer, true);
            });
          } catch {
            labelsStatus('failed');
            fail('ION_LABELS_FAILED', 'Map labels are unavailable; base imagery remains available.');
          }
        }
        if (token && !disposed) {
          try {
            const resource = await IonResource.fromAssetId(1, { accessToken: token });
            if (disposed) return;
            const terrain = await CesiumTerrainProvider.fromUrl(resource);
            if (disposed) return;
            v.terrainProvider = terrain;
            cleanups.push(terrain.errorEvent.addEventListener(() => {
              v.terrainProvider = new EllipsoidTerrainProvider();
              fail('TERRAIN_FAILED', 'Terrain failed; using the WGS84 ellipsoid.');
              v.scene.requestRender();
            }));
          } catch { fail('TERRAIN_FAILED', 'World Terrain is unavailable; using the WGS84 ellipsoid.'); }
        }
        if (!disposed && !broken) {
          // Provider metadata alone does not establish that visible tiles loaded.
          let reported = false;
          cleanups.push(v.scene.postRender.addEventListener(() => {
            if (!reported && !disposed && !broken && v.scene.globe.tilesLoaded) {
              if (!degraded && !detailedTilesAvailable.current) return;
              reported = true;
              status(degraded ? 'degraded' : 'ready');
            }
          }));
          v.scene.requestRender();
        }
      })();
    } catch {
      broken = true;
      setFatal('Unable to start the 3D Earth. Enable WebGL and hardware acceleration, then reload.');
      latest.current.onError?.({ code: 'INITIALIZATION_FAILED', message: 'Cesium could not initialize. Check WebGL support and static asset configuration.' });
      status('error');
    }
    return () => {
      if (instance && !instance.isDestroyed() && instance.camera.positionWC) {
        const cartographic = Cartographic.fromCartesian(instance.camera.positionWC);
        latest.current.onCameraChange?.({ eye: { latitude: CesiumMath.toDegrees(cartographic.latitude), longitude: CesiumMath.toDegrees(cartographic.longitude), heightMeters: cartographic.height }, center: { latitude: CesiumMath.toDegrees(cartographic.latitude), longitude: CesiumMath.toDegrees(cartographic.longitude) }, rangeMeters: Math.max(1, cartographic.height), headingDegrees: CesiumMath.toDegrees(instance.camera.heading), pitchDegrees: CesiumMath.toDegrees(instance.camera.pitch) });
      }
      disposed = true;
      cleanups.reverse().forEach(cleanup => cleanup());
      if (instance && !instance.isDestroyed()) instance.destroy();
    };
  }, []);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    viewer.entities.removeById('route');
    const coordinates = props.routeGeoJSON?.coordinates;
    if (coordinates && coordinates.length >= 2) {
      viewer.entities.add({ id: 'route', polyline: { positions: Cartesian3.fromDegreesArray(coordinates.flat()), width: 4, material: Color.ORANGE } });
    }
    viewer.scene.requestRender();
  }, [viewer, props.routeGeoJSON]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const layer = labelsLayer.current;
    if (!layer) return;
    layer.show = props.showLabels !== false;
    latest.current.onLabelsStatusChange?.(layer.show ? 'enabled' : 'hidden');
    viewer.scene.requestRender();
  }, [viewer, props.showLabels]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    const markers = [...(props.markers ?? [])];
    const selection = props.selectedLocation;
    if (selection && !markers.some(marker => marker.id === selection.id)) markers.push({ id: selection.id, label: selection.name, coordinates: selection.coordinates });
    const plan = markerPlan(markers);
    const palette = getComputedStyle(document.documentElement);
    const forestColor = Color.fromCssColorString(palette.getPropertyValue('--color-forest').trim() || '#435a4c');
    const selectedColor = Color.fromCssColorString(palette.getPropertyValue('--color-route').trim() || '#b77e3d');
    if (plan.rejected.length) latest.current.onError?.({ code: 'INVALID_MARKERS', message: 'Invalid coordinates or duplicate marker IDs were skipped (first valid ID wins).' });
    const ids = new Set(plan.accepted.map(marker => `marker:${marker.id}`));
    for (const entity of [...viewer.entities.values]) if (entity.id.startsWith('marker:') && !ids.has(entity.id)) viewer.entities.remove(entity);
    for (const marker of plan.accepted) {
      const id = `marker:${marker.id}`;
      viewer.entities.removeById(id);
      const c = marker.coordinates;
      const selected = selection?.id === marker.id;
      viewer.entities.add({ id, position: Cartesian3.fromDegrees(c.longitude, c.latitude, c.heightMeters ?? 0),
        point: { pixelSize: selected ? 11 : 7, color: selected ? selectedColor : forestColor, outlineColor: Color.WHITE, outlineWidth: 2, distanceDisplayCondition: selected ? undefined : new DistanceDisplayCondition(0, 500_000), heightReference: c.heightMeters === undefined ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
        label: { show: selected, text: marker.label, font: '13px sans-serif', style: LabelStyle.FILL_AND_OUTLINE, outlineWidth: 3, pixelOffset: new Cartesian2(0, -24), heightReference: c.heightMeters === undefined ? HeightReference.CLAMP_TO_GROUND : HeightReference.NONE },
      });
    }
    viewer.scene.requestRender();
  }, [viewer, props.markers, props.selectedLocation]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed()) return;
    if (restoreSelection.current) { restoreSelection.current = false; return; }
    viewer.camera.cancelFlight();
    const location = props.selectedLocation;
    if (!location) return;
    if (!validCoordinates(location.coordinates)) {
      latest.current.onError?.({ code: 'INVALID_LOCATION', message: 'Selected location has invalid coordinates.' });
      return;
    }
    const covered = !detailCoverage.current || Rectangle.contains(detailCoverage.current, Cartographic.fromDegrees(location.coordinates.longitude, location.coordinates.latitude));
    aim(viewer, { center: location.coordinates, rangeMeters: detailedTilesAvailable.current && covered ? 100_000 : 5_000_000 }, true);
    latest.current.onLocationSelected?.(location);
  }, [viewer, props.selectedLocation]);

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !props.fitRouteRequest || !props.routeGeoJSON?.coordinates.length) return;
    if (handledFit.current === props.fitRouteRequest) return;
    handledFit.current = props.fitRouteRequest;
    const points = props.routeGeoJSON.coordinates.map(([lon, lat]) => Cartesian3.fromDegrees(lon, lat));
    const sphere = BoundingSphere.fromPoints(points);
    viewer.camera.flyToBoundingSphere(sphere, { duration: 0, offset: new HeadingPitchRange(0, -Math.PI / 2, Math.max(sphere.radius * 3, detailedTilesAvailable.current ? 1000 : 5_000_000)) });
  }, [viewer, props.fitRouteRequest]);

  return <div style={{ width: '100%', height: '100%', minHeight: 320, position: 'relative' }}>
    <div ref={container} style={{ position: 'absolute', inset: 0 }} />
    {fatal && <p role="alert" style={{ position: 'absolute', top: 0, padding: 16, background: '#18222e', color: 'white' }}>{fatal}</p>}
  </div>;
}

function validCamera(camera: GlobeCamera) {
  return validCoordinates(camera.center) && (camera.rangeMeters === undefined || (Number.isFinite(camera.rangeMeters) && camera.rangeMeters > 0)) &&
    (camera.headingDegrees === undefined || Number.isFinite(camera.headingDegrees)) &&
    (camera.pitchDegrees === undefined || (Number.isFinite(camera.pitchDegrees) && camera.pitchDegrees >= -90 && camera.pitchDegrees <= 0));
}

export function imageryFailureMessage(error: unknown): string {
  const code = error && typeof error === 'object' && 'statusCode' in error ? error.statusCode : undefined;
  if (code === 401) return 'Imagery authentication failed. Check the local ion token. Regional fallback remains available.';
  if (code === 403) return 'Imagery access denied. Check asset permissions and the allowed application URL. Regional fallback remains available.';
  if (code === 404) return 'The imagery asset was not found or is unavailable to this token. Regional fallback remains available.';
  if (code === 429) return 'The imagery service is rate-limited. Regional fallback remains available; try again later.';
  return 'Detailed imagery could not load. Check the connection, ion token and imagery asset configuration, then reload. Regional fallback remains available.';
}

function aim(viewer: Viewer, camera: GlobeCamera, animate: boolean) {
  const c = camera.center;
  if ((camera.rangeMeters ?? 10_000_000) >= 10_000_000) {
    viewer.camera.setView({ destination: Cartesian3.fromDegrees(c.longitude, c.latitude, camera.rangeMeters ?? 20_000_000), orientation: { heading: CesiumMath.toRadians(camera.headingDegrees ?? 0), pitch: -Math.PI / 2, roll: 0 } });
    return;
  }
  viewer.camera.flyToBoundingSphere(new BoundingSphere(Cartesian3.fromDegrees(c.longitude, c.latitude, c.heightMeters ?? 0), 0), {
    duration: animate && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 1.5 : 0,
    offset: new HeadingPitchRange(CesiumMath.toRadians(camera.headingDegrees ?? 0), CesiumMath.toRadians(camera.pitchDegrees ?? -60), camera.rangeMeters ?? 10_000_000),
  });
}
