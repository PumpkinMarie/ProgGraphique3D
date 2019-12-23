"use strict"

//--------------------------------------------------------------------------------------------------------
// VERTEX SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var shader_vert=`#version 300 es

////////////////////////////////////////////////////////////////////////////////
// INPUT
////////////////////////////////////////////////////////////////////////////////

layout(location=0) in vec3 position_in;
layout(location=1) in vec3 normal_in;
layout(location=2) in vec2 texcoord_in;

////////////////////////////////////////////////////////////////////////////////
// UNIFORM
////////////////////////////////////////////////////////////////////////////////

uniform mat4 projectionMatrix;
uniform mat4 viewMatrix;
uniform mat3 normalMatrix;
uniform mat4 modelMatrix;


////////////////////////////////////////////////////////////////////////////////
// OUTPUT
////////////////////////////////////////////////////////////////////////////////

out vec3 Po;
out vec3 No;
out vec2 uv;
out float d;
////////////////////////////////////////////////////////////////////////////////
// PROGRAM
////////////////////////////////////////////////////////////////////////////////
float sdCircle( vec2 p, float r )
{
  return length(p) - r;
}

float sdBox( vec2 p, vec2 b )
{
    vec2 d = abs(p)-b;
    return length(max(d,vec2(0))) + min(max(d.x,d.y),0.0);
}

void main()
{
	// Send position to clip space
	gl_Position = projectionMatrix * viewMatrix * modelMatrix * vec4(position_in,1.0);
	Po =  vec3(viewMatrix * modelMatrix * vec4(position_in,1.0));
	No = normalMatrix * normal_in;
	//float radius = 0.1;
	//d = sdCircle( texcoord_in - vec2( 0.1 ), radius );
	//d = sdBox( texcoord_in - vec2( 0.1 ),  vec2( 0.0,0.0 ) );
	//uv = texcoord_in + cos(d);
	
	uv = texcoord_in;
}`;

//--------------------------------------------------------------------------------------------------------
// FRAGMENT SHADER (GLSL language)
//--------------------------------------------------------------------------------------------------------
var shader_frag=`#version 300 es

precision highp float;

////////////////////////////////////////////////////////////////////////////////
// INPUT
////////////////////////////////////////////////////////////////////////////////

in vec3 Po;
in vec3 No;
in vec2 uv;
in float d;
////////////////////////////////////////////////////////////////////////////////
// UNIFORM
////////////////////////////////////////////////////////////////////////////////

const float spec = 150.0;
uniform vec3 light_pos;
uniform int uRenderingType;
// - toon/cel shading
uniform int nbb;

// - damier
uniform int nbd_x;
uniform int nbd_y;

// - post-processing (gamma correction)
uniform float gamma;

#define PI 3.141592
#define NB_LIGHTS 2

// Light
uniform struct LightInfo
{
	vec4 Position; // light position
	vec3 L;        // light intensity
} Light[ NB_LIGHTS ];

// Material
uniform struct MaterialInfo
{
	float Rough;
	bool Metal;
	vec3 Color;
} Material;

////////////////////////////////////////////////////////////////////////////////
// OUTPUT
////////////////////////////////////////////////////////////////////////////////

out vec4 frag_out;

////////////////////////////////////////////////////////////////////////////////
// FUNCTION
////////////////////////////////////////////////////////////////////////////////

// --------------------
// schlickFresnel
// --------------------
vec3 schlickFresnel( float lDotH )
{
	vec3 f0 = vec3( 0.04 ); // Dielectrics
	if ( Material.Metal )
	{
		f0 = Material.Color;
	}
	return f0 + ( 1.0 - f0 ) * pow( 1.0 - lDotH, 5.0 );
}

// --------------------
// geomSmith
// --------------------
float geomSmith( float dotProd )
{
	float k = ( Material.Rough + 1.0 ) * ( Material.Rough + 1.0 ) / 8.0;
	float denom = dotProd * ( 1.0 - k ) + k;
	return 1.0 / denom;
}

// --------------------
// ggxDistribution
// --------------------
float ggxDistribution( float nDotH )
{
	float alpha2 = Material.Rough * Material.Rough * Material.Rough * Material.Rough;
	float d = ( nDotH * nDotH ) * ( alpha2 - 1.0 ) + 1.0;
	return alpha2 / ( PI * d * d );
}

// --------------------
// microfacetModel
// --------------------
vec3 microfacetModel( int lightIdx, vec3 position, vec3 n )
{
	vec3 diffuseBrdf = vec3( 0.0 ); // Metallic
	if ( ! Material.Metal )
	{
		diffuseBrdf = Material.Color;
	}
	
	vec3 l = vec3( 0.0 );
	vec3 lightI = Light[ lightIdx ].L;
	if ( Light[ lightIdx ].Position.w == 0.0 ) // Directional light
	{
		l = normalize( Light[ lightIdx].Position.xyz );
	}
	else // Positional light
	{
		l = Light[ lightIdx ].Position.xyz - position;
		float dist = length( l );
		l = normalize( l );
		lightI /= ( dist * dist );
	}
	
	vec3 v = normalize( -position );
	vec3 h = normalize( v + l );
	float nDotH = dot( n, h );
	float lDotH = dot( l, h );
	float nDotL = max( dot( n, l ), 0.0 );
	float nDotV = dot( n, v );
	vec3 specBrdf = 0.25 * ggxDistribution( nDotH ) * schlickFresnel( lDotH ) * geomSmith( nDotV );
	
	// ambient (coarse approximation of global illumination)
	vec3 ambientBrdf = vec3( 0.5 );
	
	return ( ambientBrdf + diffuseBrdf + PI * specBrdf ) * lightI * nDotL;
}

// --------------------
// noise
// - here, is it a noise function that create random values in [-1.0;1.0] given a position in [0.0;1.0]
// --------------------
float noise( vec2 st )
{
    return fract( sin( dot( st.xy, vec2( 12.9898, 78.233 ) ) ) * 43758.5453123 );
}

// --------------------
// rotate
// --------------------
vec2 rotate( vec2 v, float a )
{
	float s = sin( a );
	float c = cos( a );
	mat2 m = mat2( c, -s, s, c );
	return m * v;
}

vec3 damier (vec2 uv)
{
	float seuil_x = 1.0 / float(nbd_x);
	int valx = 0;
	int valy = 0;
	for (int i = 1; i<= nbd_x; i++){
		if (mod(uv,1.0).x < seuil_x*float(i)){
			if (i%2 == 1){
				valx = 1;
				break;}
			else{
				valx = 0;
				break;
			}
		}
	}
	float seuil_y = 1.0 / float(nbd_y);
	for (int i = 1; i<= nbd_y; i++){
		if (mod(uv,1.0).y < seuil_y*float(i)){
			if (i%2 == 1){
				valy = 1;
				break;}
			else{
				valy = 0;
				break;
			}
		}
	}
	if (valx == valy)
		return vec3(0.0);
	else
		return vec3(1.0);
}

////////////////////////////////////////////////////////////////////////////////
// PROGRAM
////////////////////////////////////////////////////////////////////////////////
void main()
{
	if (uRenderingType == 0){
		vec3 color = vec3(0);
		vec3 Kd = vec3(1.0,1.0,1.0);
		vec3 Ks = vec3(0.5,0.5,0.5);
		for (int i=0;i<NB_LIGHTS;i++){
			// 2) Reflected diffuse intensity
			vec3 lightDir = normalize( Light[ i ].Position.xyz - Po ); // "light direction" from current vertex position
			float diffuseTerm = max( 0.0, dot( No, lightDir ) ); // "max" is used to avoir "back" lighting (when light is behind the object)
			vec3 LumI = vec3(Light[ i ].L.x/100.0,Light[ i ].L.y/100.0,Light[ i ].L.z/100.0);
			vec3 Id = LumI * Kd * vec3( diffuseTerm );
			// 3) Reflected specular intensity
			vec3 Is = vec3( 0.0 );
			if ( diffuseTerm > 0.0 )
			{
				vec3 viewDir = normalize( -Po ); // "view direction" from current vertex position => because, in View space, "dir = vec3( 0.0, 0.0, 0.0 ) - p"
				vec3 halfDir = normalize( viewDir + lightDir ); // half-vector between view and light vectors
				float specularTerm = max( 0.0, pow( dot( No, halfDir ), spec ) ); // "Ns" control the size of the specular highlight
				Is = LumI * Ks * vec3( specularTerm );
			}
			// Reflected intensity (i.e final color)
			// - this "per-vertex" value is sent through the graphics pipeline to be "interpolated" by the hardware rasterizer and retrieved in the fragment shader
			color += Id + Is;
		}
		frag_out = vec4( color, 1.0 );
	}

	else if (uRenderingType == 1){
		// Final color
		vec3 color = vec3(0);
		for (int i=0;i<NB_LIGHTS;i++)
			color += microfacetModel( i, Po, No );	
		// Write fragment's color
		frag_out = vec4( color, 1.0 );
	}

	else if (uRenderingType == 2){
		vec3 value = vec3(0);
		vec3 Kd = vec3(1.0,1.0,1.0);
		vec3 Ks = vec3(0.5,0.5,0.5);
		for (int i=0;i<NB_LIGHTS;i++){
			vec3 lightDir = normalize( Light[ i ].Position.xyz - Po ); // "light direction" from current vertex position
			float diffuseTerm = max( 0.0, dot( No, lightDir ) ); // "max" is used to avoir "back" lighting (when light is behind the object)
			vec3 LumI = vec3(Light[ i ].L.x/100.0,Light[ i ].L.y/100.0,Light[ i ].L.z/100.0);
			vec3 Id = LumI * Kd * vec3( diffuseTerm );
			float seuil = 1.0 / float(nbb);
			for (int i = 1; i<= nbb; i++){
				if (Id.x < seuil*float(i)){
					Id.x = seuil*float(i-1);
					break;
				}
			}
			for (int i = 1; i<= nbb; i++){
				if (Id.y < seuil*float(i)){
					Id.y = seuil*float(i-1);
					break;
				}
			}
			for (int i = 1; i<= nbb; i++){
				if (Id.z < seuil*float(i)){
					Id.z = seuil*float(i-1);
					break;
				}
			}

			vec3 Is = vec3( 0.0 );
			if ( diffuseTerm > 0.0 )
			{
				vec3 viewDir = normalize( -Po ); // "view direction" from current vertex position => because, in View space, "dir = vec3( 0.0, 0.0, 0.0 ) - p"
				vec3 halfDir = normalize( viewDir + lightDir ); // half-vector between view and light vectors
				float specularTerm = max( 0.0, pow( dot( No, halfDir ), spec ) ); // "Ns" control the size of the specular highlight
				float seuilspec = 0.5;
				if (specularTerm > seuilspec)
					specularTerm = 1.0;
				else
					specularTerm = 0.0;

				Is = LumI * Ks * vec3( specularTerm );
			}

			value += Id  + Is;
		}

		frag_out = vec4( value, 1.0 );
	}

	else if (uRenderingType == 3)
	{
		frag_out = vec4( damier(uv), 1.0 );

	}

	else{
		// Final color
		vec3 color = vec3(0);
		for (int i=0;i<NB_LIGHTS;i++)
			color += microfacetModel( i, Po, No );	
		// Write fragment's color
		frag_out = vec4( color, 1.0 );
	}

}
`;

//--------------------------------------------------------------------------------------------------------
// GLOBAL VARIABLES
//--------------------------------------------------------------------------------------------------------

//-------------------------------------
// GL scene
//-------------------------------------

// Shader program
let shaderProgram = null;

// Mesh
let mesh_rend = null;

// Toon/cell shading
let nbb = 3;

// Light
let light_pos = Vec3( 0.0, 0.0, 0.0 );

// Animation
let speed = 10;

//Nb Anneaux
let nbAnneaux = 20;
//-------------------------------------
// GUI (graphical user interface)
//-------------------------------------

// Rendering
var slider_renderingType;

// Animation
var checkbox_animation;

// Light Info
var checkbox_light_space; // light position in "view" (false) or "world" (true) space
var slider_light_power; // watt
// - light #0
var slider_light_0_intensity_r;
var slider_light_0_intensity_g;
var slider_light_0_intensity_b;
// - light #1
var slider_light_1_intensity_r;
var slider_light_1_intensity_g;
var slider_light_1_intensity_b;

// Material Info
var slider_material_rough; // roughness
var checkbox_material_metal; // metal or dielectric
var slider_material_color_r;
var slider_material_color_g;
var slider_material_color_b;

// Toon/cel shading
var slider_toonShading_nbBands;

// Damier 
var slider_damierText_nbBands_x;
var slider_damierText_nbBands_y;

// Post-processing
var slider_gammaCorrection;

//--------------------------------------------------------------------------------------------------------
// Initialize graphics objects and GL states
//
// Here, we want to load a 3D asset
// Uniforms are used to be able edit GPU data with a customized GUI (graphical user interface)
//--------------------------------------------------------------------------------------------------------
function init_wgl()
{
	// ANIMATIONS // [=> Sylvain's API]
	// - if animations, set this internal variable (it will refresh the window everytime)
	ewgl.continuous_update = true;
	
	// CUSTOM USER INTERFACE
	// - this will enable to use GPU "uniform" variables to be able to edit GPU constant variables (at rendering stage)
	UserInterface.begin(); // name of html id
	{
		// MESH COLOR
	    // - container (H: horizontal)
		UserInterface.use_field_set( 'H', "Rendering" );
			// - sliders (name, min, max, default value, callback called when value is modified)
			// - update_wgl() is callrd to refresh screen
			slider_renderingType = UserInterface.add_slider( 'Type ', 0, 3, 2, update_wgl );
			set_widget_color( slider_renderingType,'#ff0000','#ffcccc' );
			checkbox_animation  = UserInterface.add_check_box( 'animation', true, update_wgl );
		UserInterface.end_use();
		
		// LIGHT INFO
		UserInterface.use_field_set( 'V', "Light Intensity" );
			UserInterface.use_field_set( 'H', "" );
				checkbox_light_space = UserInterface.add_check_box( 'view vs world', false, update_wgl );
				slider_light_power = UserInterface.add_slider( 'power (watt)', 1, 300, 100, update_wgl );
			UserInterface.end_use();
			UserInterface.use_field_set( 'H', "" );
				slider_light_0_intensity_r = UserInterface.add_slider( 'R', 0, 100, 0, update_wgl );
				slider_light_0_intensity_g = UserInterface.add_slider( 'G', 0, 100, 100, update_wgl );
				slider_light_0_intensity_b = UserInterface.add_slider( 'B', 0, 100, 0, update_wgl );
			UserInterface.end_use();
			UserInterface.use_field_set( 'H', "" );
				slider_light_1_intensity_r = UserInterface.add_slider( 'R', 0, 100, 0, update_wgl );
				slider_light_1_intensity_g = UserInterface.add_slider( 'G', 0, 100, 50, update_wgl );
				slider_light_1_intensity_b = UserInterface.add_slider( 'B', 0, 100, 0, update_wgl );
			UserInterface.end_use();
		UserInterface.end_use();

		// MATERIAL INFO
		UserInterface.use_field_set( 'V', "PBR Material (GGX)" );
			UserInterface.use_field_set( 'H', "" );
				slider_material_rough = UserInterface.add_slider( 'roughness', 0, 100, 50, update_wgl );
				checkbox_material_metal = UserInterface.add_check_box( 'metal', true, update_wgl );
			UserInterface.end_use();
			UserInterface.use_field_set( 'H', "color" );
				slider_material_color_r = UserInterface.add_slider( 'R', 0, 100, 50, update_wgl );
				slider_material_color_g = UserInterface.add_slider( 'G', 0, 100, 50, update_wgl );
				slider_material_color_b = UserInterface.add_slider( 'B', 0, 100, 50, update_wgl );
			UserInterface.end_use();
		UserInterface.end_use();
		
		// TOON/CEL SHADING
		UserInterface.use_field_set( 'V', "Toon/Cel Shading" );
			slider_toonShading_nbBands = UserInterface.add_slider( 'nb bands', 1, 10, 3, update_wgl );
		UserInterface.end_use();

		UserInterface.use_field_set( 'H', "Damier Texture" );
			slider_damierText_nbBands_x = UserInterface.add_slider( 'nb bands_x', 1, 20, 6, update_wgl );
			slider_damierText_nbBands_y = UserInterface.add_slider( 'nb bands_y', 1, 20, 6, update_wgl );
		UserInterface.end_use();		

		// POST-PROCESSING
		UserInterface.use_field_set( 'V', "Post-Processing" );
			slider_gammaCorrection = UserInterface.add_slider( 'gamma', 1, 40, 22, update_wgl );
		UserInterface.end_use();		
	}	
	UserInterface.end();
	
	// Shader program
	shaderProgram = ShaderProgram( shader_vert, shader_frag, 'shader' );

	// Create mesh here !!!!!

	//Create geometry
	let mesh = Mesh.Tore(50,50,0.5,2);


	mesh_rend = mesh.renderer(0,1,2);

	// place la camera pour bien voir l'objet
	ewgl.scene_camera.show_scene( mesh.BB );
	ewgl.scene_camera.set_scene_radius( 20 );
	ewgl.continuous_update = true;
	
	// Configure GL state(s)
	gl.clearColor( 1.0, 1.0, 1.0, 1.0 );
	gl.enable( gl.DEPTH_TEST );
}

//--------------------------------------------------------------------------------------------------------
// Render scene
//--------------------------------------------------------------------------------------------------------
function draw_wgl()
{
	gl.clear( gl.COLOR_BUFFER_BIT );


	// Pre-render stage
	ewgl.continuous_update = checkbox_animation.checked;
    shaderProgram.bind();
	// Set uniform(s)
	// - camera
	Uniforms.projectionMatrix = ewgl.scene_camera.get_projection_matrix();

	let viewMatrix = ewgl.scene_camera.get_view_matrix();
	Uniforms.viewMatrix = viewMatrix;

	// Rendering Type
	Uniforms.uRenderingType = slider_renderingType.value;
	// // - light info
	// // -- intensity
	// // ---- #0
	 gl.uniform3f( gl.getUniformLocation( shaderProgram.prg, "Light[0].L" ),
				 slider_light_0_intensity_r.value / 100.0 * slider_light_power.value,
				 slider_light_0_intensity_g.value / 100.0 * slider_light_power.value,
				 slider_light_0_intensity_b.value / 100.0 * slider_light_power.value );
	// // ---- #1
	 gl.uniform3f( gl.getUniformLocation( shaderProgram.prg, "Light[1].L" ),
				 slider_light_1_intensity_r.value / 100.0 * slider_light_power.value,
				 slider_light_1_intensity_g.value / 100.0 * slider_light_power.value,
				 slider_light_1_intensity_b.value / 100.0 * slider_light_power.value );
	// -- positions
	if (checkbox_light_space.checked){
		let lum_pos = Matrix.mult(viewMatrix,Vec4(1.0,1.0,1.0,1.0));
		gl.uniform4f( gl.getUniformLocation( shaderProgram.prg, "Light[0].Position" ), lum_pos.x,lum_pos.y,lum_pos.z,1.0);
		// ---- #1
		gl.uniform4f( gl.getUniformLocation( shaderProgram.prg, "Light[1].Position" ), lum_pos.x,lum_pos.y,lum_pos.z,1.0);	
	}
	else{
		// ---- #0
		gl.uniform4f( gl.getUniformLocation( shaderProgram.prg, "Light[0].Position" ), 0.0, 0.0, 0.0, 1.0 );
		// ---- #1
		gl.uniform4f( gl.getUniformLocation( shaderProgram.prg, "Light[1].Position" ), 0.0, 0.0, 0.0, 1.0 );
		// - default light
		//Uniforms.light_pos = light_pos;
	}
	// - material info
	gl.uniform1f( gl.getUniformLocation( shaderProgram.prg, "Material.Rough" ), slider_material_rough.value / 100.0 );
	gl.uniform1i( gl.getUniformLocation( shaderProgram.prg, "Material.Metal" ), checkbox_material_metal.checked );
	gl.uniform3f( gl.getUniformLocation( shaderProgram.prg, "Material.Color" ), slider_material_color_r.value / 100.0, slider_material_color_g.value / 100.0, slider_material_color_b.value / 100.0 );
  	// - toon/cel shading
	Uniforms.nbb = slider_toonShading_nbBands.value;

	// - damier
	Uniforms.nbd_x = slider_damierText_nbBands_x.value;
	Uniforms.nbd_y = slider_damierText_nbBands_y.value;

	// - post-processing
	//Uniforms.gamma = slider_gammaCorrection.value / 10.0;

	let modelMatrix = Matrix.scale(1);
	Uniforms.normalMatrix = ( Matrix.mult( ewgl.scene_camera.get_view_matrix(), modelMatrix ) ).inverse3transpose();
	Uniforms.modelMatrix = modelMatrix;

	//Affichage d'un tore dans un carré en bas à droite
	gl.viewport( 1.5 *gl.canvas.width/4, 0, gl.canvas.width, gl.canvas.height/2 );
	mesh_rend.draw( gl.TRIANGLES );

	//Change de viewport
	gl.viewport( 0, 0, gl.canvas.width, gl.canvas.height );

	//On initialise les variables qui vont changer pour chaque tore, la matrice Model (déplacement de rayon 9), la position du premier tore sur le cercle et l'angle de rotation
	let time = 0;
	if (ewgl.continuous_update == true)
		time = Math.sin( ewgl.current_time ); 

	modelMatrix = Matrix.mult( Matrix.scale(1), Matrix.translate(9,9,0));
	let position = (2 * 3.14)/20 ;
	let rotationAngle = 0;
	for (let i = 0; i< nbAnneaux ;i++){
		// - pour chaque anneau on va le déplacer de la poistion et du i sur le cercle et d'une rotation de 117 degrés. L'axe de rotation est le vecteur orthogonal au vecteur du centre du tore vers (0,0).
		let vecteur = Vec3(9*Math.cos(position*i+time),9*Math.sin(position*i+time),0);
		let vecteurortho = Vec3(-9*Math.sin(position*i+time),9*Math.cos(position*i+time),0);
		modelMatrix = Matrix.mult( Matrix.translate(vecteur,0),Matrix.rotate(rotationAngle,vecteurortho));
		Uniforms.normalMatrix = ( Matrix.mult( ewgl.scene_camera.get_view_matrix(), modelMatrix ) ).inverse3transpose();
		Uniforms.modelMatrix = modelMatrix;
		rotationAngle += 117;

		mesh_rend.draw( gl.TRIANGLES );
	}


	gl.useProgram( null ); // not mandatory. For optimization, could be removed.

}

//--------------------------------------------------------------------------------------------------------
// => Sylvain's API - call window creation with your customized "init_wgl()" and "draw_wgl()" functions
//--------------------------------------------------------------------------------------------------------
ewgl.launch_3d();
