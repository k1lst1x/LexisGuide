import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export function ArchitectureScene() {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = host.current
    if (!element) return

    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.18
    element.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(36, 1, .1, 100)
    camera.position.set(5.4, 3.4, 9.4)

    const group = new THREE.Group()
    scene.add(group)
    const material = (color: number, roughness = .58, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness })
    const stone = material(0xc9ae97, .88)
    const stoneLight = material(0xe4cdb7, .74)
    const grass = material(0x486038, .95)
    const bronze = material(0xa96742, .31, .58)
    const ivory = new THREE.MeshPhysicalMaterial({ color: 0xfffaf1, roughness: .18, metalness: .04, transmission: .04, clearcoat: .8 })

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(18, 14), grass)
    floor.rotation.x = -Math.PI / 2
    floor.receiveShadow = true
    group.add(floor)

    const wall = new THREE.Mesh(new THREE.BoxGeometry(16, 7.5, .45), stone)
    wall.position.set(0, 3.5, -4.4)
    wall.receiveShadow = true
    group.add(wall)

    const roof = new THREE.Mesh(new THREE.BoxGeometry(16, .55, 10), stoneLight)
    roof.position.set(.4, 7.05, -.4)
    roof.rotation.z = -.05
    roof.castShadow = true
    group.add(roof)

    const makeColumn = (x: number, z: number, height: number) => {
      const column = new THREE.Group()
      const body = new THREE.Mesh(new THREE.BoxGeometry(.9, height, .9), stoneLight)
      body.position.y = height / 2
      body.castShadow = true
      body.receiveShadow = true
      const cap = new THREE.Mesh(new THREE.BoxGeometry(1.2, .23, 1.2), stone)
      cap.position.y = height + .1
      cap.castShadow = true
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.13, .18, 1.13), stone)
      base.position.y = .09
      column.add(body, cap, base)
      column.position.set(x, 0, z)
      group.add(column)
    }
    makeColumn(-4.3, -1.6, 6.5)
    makeColumn(-1.7, -2.2, 5.9)
    makeColumn(2.3, -1.9, 6.4)
    makeColumn(5, -.9, 6.8)

    const shrine = new THREE.Group()
    shrine.position.set(.15, 2.55, .35)
    group.add(shrine)
    const orb = new THREE.Mesh(new THREE.IcosahedronGeometry(.78, 5), ivory)
    orb.castShadow = true
    shrine.add(orb)
    const haloOne = new THREE.Mesh(new THREE.TorusGeometry(1.27, .026, 12, 100), bronze)
    haloOne.rotation.set(1.1, .15, -.3)
    shrine.add(haloOne)
    const haloTwo = new THREE.Mesh(new THREE.TorusGeometry(1.6, .014, 12, 100), stoneLight)
    haloTwo.rotation.set(.3, 1.16, .4)
    shrine.add(haloTwo)

    const scales = new THREE.Group()
    scales.position.set(.15, .36, .55)
    shrine.add(scales)
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(.035, .06, 1.24, 16), bronze)
    stem.position.y = .62
    scales.add(stem)
    const beam = new THREE.Mesh(new THREE.BoxGeometry(2.2, .055, .055), bronze)
    beam.position.y = 1.22
    scales.add(beam)
    const tray = (x: number) => {
      const cable = new THREE.Mesh(new THREE.CylinderGeometry(.01, .01, .58, 8), bronze)
      cable.position.set(x, .92, 0)
      const pan = new THREE.Mesh(new THREE.TorusGeometry(.34, .026, 10, 48), bronze)
      pan.position.set(x, .62, 0)
      pan.rotation.x = Math.PI / 2
      scales.add(cable, pan)
    }
    tray(-.95); tray(.95)

    const bladeGeometry = new THREE.PlaneGeometry(.028, .34)
    const blades = new THREE.InstancedMesh(bladeGeometry, material(0x5e7d45, .95), 520)
    const dummy = new THREE.Object3D()
    for (let index = 0; index < 520; index += 1) {
      const radius = 6 * Math.sqrt(Math.random())
      const angle = Math.random() * Math.PI * 2
      dummy.position.set(Math.cos(angle) * radius, .16, Math.sin(angle) * radius - .2)
      dummy.rotation.set(0, Math.random() * Math.PI, (Math.random() - .5) * .35)
      dummy.scale.setScalar(.65 + Math.random() * 1.4)
      dummy.updateMatrix()
      blades.setMatrixAt(index, dummy.matrix)
    }
    blades.castShadow = true
    group.add(blades)

    const dustGeometry = new THREE.BufferGeometry()
    const dust = new Float32Array(420 * 3)
    for (let index = 0; index < dust.length; index += 3) { dust[index] = (Math.random() - .5) * 11; dust[index + 1] = Math.random() * 6.5; dust[index + 2] = (Math.random() - .5) * 7 }
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dust, 3))
    const dustPoints = new THREE.Points(dustGeometry, new THREE.PointsMaterial({ color: 0xfff3df, size: .025, transparent: true, opacity: .8 }))
    scene.add(dustPoints)

    scene.add(new THREE.HemisphereLight(0xffe7cc, 0x354128, 2.4))
    const key = new THREE.DirectionalLight(0xffe0bf, 3.2)
    key.position.set(-4.5, 7, 5)
    key.castShadow = true
    key.shadow.mapSize.set(1024, 1024)
    scene.add(key)
    const glow = new THREE.PointLight(0xffd1b1, 14, 9, 2)
    glow.position.set(.1, 3.1, 2.2)
    scene.add(glow)

    const pointer = new THREE.Vector2()
    const move = (event: PointerEvent) => {
      const rect = element.getBoundingClientRect()
      pointer.x = ((event.clientX - rect.left) / rect.width - .5) * 2
      pointer.y = ((event.clientY - rect.top) / rect.height - .5) * 2
    }
    element.addEventListener('pointermove', move)
    const resize = () => {
      const width = element.clientWidth
      const height = element.clientHeight
      camera.aspect = width / height
      camera.updateProjectionMatrix()
      renderer.setSize(width, height)
    }
    const observer = new ResizeObserver(resize)
    observer.observe(element)
    resize()

    let frame = 0
    const render = (time: number) => {
      const t = time * .001
      shrine.rotation.y = Math.sin(t * .35) * .18
      shrine.position.y = 2.55 + Math.sin(t * .9) * .15
      orb.rotation.set(t * .24, t * .4, t * .16)
      haloOne.rotation.z = t * .36
      haloTwo.rotation.y = t * -.28
      beam.rotation.z = Math.sin(t * 1.25) * .09
      dustPoints.rotation.y = t * .014
      group.rotation.y += (pointer.x * .11 - group.rotation.y) * .025
      camera.position.x += (5.4 + pointer.x * .7 - camera.position.x) * .025
      camera.position.y += (3.4 - pointer.y * .35 - camera.position.y) * .025
      camera.lookAt(0, 2.25, 0)
      renderer.render(scene, camera)
      frame = window.requestAnimationFrame(render)
    }
    frame = window.requestAnimationFrame(render)

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      element.removeEventListener('pointermove', move)
      renderer.dispose()
      element.replaceChildren()
    }
  }, [])

  return <div className="webgl-architecture" ref={host} aria-hidden="true" />
}
