<!-- Fixed WebGL canvas, whale labels, film grain, ROV frame, custom cursor and the DOM column wipe -->
<template>
  <div class="overlays">
  <canvas class="stage" aria-hidden="true"></canvas>
  <div class="markers" aria-hidden="true"></div>
  <div class="grain" aria-hidden="true"></div>
  <div class="hud" aria-hidden="true"><i class="hud__c hud__c--tl"></i><i class="hud__c hud__c--tr"></i><i class="hud__c hud__c--bl"></i><i class="hud__c hud__c--br"></i></div>
  <div class="cursor" aria-hidden="true"><span class="cursor__dot"></span><span class="cursor__label"></span></div>
  <div class="tcols" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></div>
  </div>
</template>
