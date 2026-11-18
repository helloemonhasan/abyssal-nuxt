<!-- Fixed WebGL canvas, service-marker layer, custom cursor and the DOM column wipe -->
<template>
  <div class="overlays">
  <canvas class="stage" aria-hidden="true"></canvas>
  <div class="markers" aria-hidden="true"></div>
  <div class="cursor" aria-hidden="true"><span class="cursor__dot"></span><span class="cursor__label"></span></div>

  <!-- Column wipe used for DOM transitions -->
  <div class="tcols" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
  </div>
</template>
