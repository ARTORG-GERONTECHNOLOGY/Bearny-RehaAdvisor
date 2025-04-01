# core/serializers.py

from rest_framework import serializers
from .models import Intervention, PatientType

# Define PatientTypeSerializer
class PatientTypeSerializer(serializers.Serializer):
    type = serializers.CharField()
    frequency = serializers.CharField()
    include_option = serializers.BooleanField()

# Define InterventionSerializer
class InterventionSerializer(serializers.Serializer):
    title = serializers.CharField()
    description = serializers.CharField()
    content_type = serializers.CharField()
    web_link = serializers.CharField(allow_blank=True, required=False)  # Optional for non-articles
    media_file = serializers.CharField(allow_blank=True, required=False)  # Optional for non-media
    patient_types = PatientTypeSerializer(many=True)  # Use embedded serializer for patient types

    def create(self, validated_data):
        patient_types_data = validated_data.pop('patient_types')
        recommendation = Intervention(**validated_data)
        recommendation.patient_types = [
            PatientType(**pt_data) for pt_data in patient_types_data
        ]
        recommendation.save()
        return recommendation
